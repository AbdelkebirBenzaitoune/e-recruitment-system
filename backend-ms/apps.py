
import os
import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from bson import ObjectId
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename
from pymongo import MongoClient
from flask_bcrypt import Bcrypt
from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)
import google.generativeai as genai
from models.result import (
    create_result, 
    create_quiz_result, 
    create_quiz_evaluation_result,
    create_formation_recommendations_result,
    get_latest_result,
    SUPPORTED_RESULT_TYPES
)

import requests
from typing import List, Dict, Any, Optional
import re

from cv_parsing.extractors import extract_text
from cv_parsing.gemini_parser import parse_cv_with_gemini
from cv_parsing.job_parsing import parse_job
from cv_job_matching import CVJobEmbeddingSimilarity
from quiz_module import QuizGenerator, QuizEvaluator, Quiz, QuizQuestion
from models.result import create_result

# -------------------- CONFIG APP --------------------
app = Flask(__name__)
# CORS pour Vite (5173) + Allow Authorization header
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'docx'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'super-secret-key')

# MongoDB
mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/')
client = MongoClient(mongo_uri)
db = client['jobmatch']
users_collection = db['users']

bcrypt = Bcrypt(app)
jwt = JWTManager(app)

# -------------------- GEMINI --------------------
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
gemini_model = genai.GenerativeModel('gemini-1.5-flash')

# Similarity model
try:
    similarity_calculator = CVJobEmbeddingSimilarity(model_type="sentence_transformer")
    print("SentenceTransformer chargé")
except Exception as e:
    print(f" Erreur modèle similarité: {e}")
    similarity_calculator = None

# Quiz generator
try:
    quiz_generator = QuizGenerator(gemini_model)
    print(" Générateur de quiz prêt")
except Exception as e:
    print(f" Erreur générateur quiz: {e}")
    quiz_generator = None

# -------------------- HELPERS GÉNÉRAUX --------------------
def _first_non_empty(*vals):
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None

def _top(items: List[str], k=8):
    return [s for s in items if isinstance(s, str) and s.strip()][:k]

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_result_to_db(user_id, result_type, data, meta=None, refs=None):
    """
    Sauvegarde un résultat en base avec validation du type
    """
    try:
        # Utiliser les fonctions spécialisées pour certains types
        if result_type == "quiz":
            result = create_quiz_result(user_id, data, meta)
        elif result_type == "quiz_evaluation":
            result = create_quiz_evaluation_result(user_id, data, meta, refs)
        elif result_type == "formation_recommendations":
            result = create_formation_recommendations_result(user_id, data, meta)
        else:
            # Fonction générique pour les autres types
            result = create_result(user_id, result_type, data, meta, refs)
        
        # Insertion en base
        inserted = db.results.insert_one(result)
        
        print(f" Résultat {result_type} sauvegardé (ID: {inserted.inserted_id})")
        
        # Log détaillé pour quiz_evaluation
        if result_type == "quiz_evaluation":
            score = data.get("percentage", 0)
            total_q = data.get("total", 0)
            print(f"    Score quiz: {score}% ({data.get('score', 0)}/{total_q})")
        
        return inserted.inserted_id
        
    except Exception as e:
        print(f" Erreur save_result_to_db ({result_type}): {e}")
        return None

def generate_feedback(percentage: float, detailed_results: list) -> dict:
    if percentage >= 80:
        return {"level": "Excellent", "message": "Félicitations ! Vous maîtrisez très bien le sujet.", "color": "green"}
    if percentage >= 60:
        return {"level": "Bien", "message": "Bon travail ! Quelques points à revoir.", "color": "blue"}
    if percentage >= 40:
        return {"level": "Moyen", "message": "Il y a des lacunes à combler.", "color": "orange"}
    return {"level": "À améliorer", "message": "Revoyez les bases, courage !", "color": "red"}

# -------------------- HELPERS CARTES --------------------
def summarize_cv_for_card(cv: Dict[str, Any]) -> Dict[str, Any]:
    name = cv.get("name") or cv.get("full_name") or "Candidat"
    skills = cv.get("skills", []) or []
    exp = cv.get("experience", []) or []
    edu = cv.get("education", []) or []
    langs = cv.get("languages", []) or []

    last_role = last_company = None
    if isinstance(exp, list) and exp:
        last = exp[0]
        last_role = _first_non_empty(last.get("job_title"), last.get("title"), last.get("role"))
        last_company = _first_non_empty(last.get("company"), last.get("company_name"), last.get("employer"))

    highest_degree = None
    if isinstance(edu, list) and edu:
        e0 = edu[0]
        highest_degree = _first_non_empty(e0.get("degree"), e0.get("diploma"), e0.get("title"))

    bullets = []
    if last_role or last_company:
        bullets.append(f"Dernière expérience : {last_role or 'Poste'} @ {last_company or 'Entreprise'}")
    if highest_degree:
        bullets.append(f"Formation principale : {highest_degree}")
    if langs:
        bullets.append("Langues : " + ", ".join(_top([str(l) for l in langs], 4)))
    if skills:
        bullets.append("Compétences clés : " + ", ".join(_top([str(s) for s in skills], 6)))

    return {
        "type": "cv",
        "title": name,
        "subtitle": last_role or "Profil du candidat",
        "chips": _top([str(s) for s in skills], 8),
        "bullets": bullets,
        "updatedAt": datetime.utcnow().isoformat() + "Z"
    }

def summarize_job_for_card(job: Dict[str, Any]) -> Dict[str, Any]:
    title = job.get("title") or "Offre"
    company = _first_non_empty(job.get("company"), job.get("employer"), job.get("organization"))
    location = _first_non_empty(job.get("location"), job.get("city"))
    required_skills = job.get("required_skills", []) or []
    responsibilities = job.get("responsibilities", []) or job.get("missions", []) or []
    requirements = job.get("requirements", []) or []

    bullets = []
    if company: bullets.append(f"Entreprise : {company}")
    if location: bullets.append(f"Localisation : {location}")
    if responsibilities: bullets.append("Responsabilités : " + ", ".join(_top([str(r) for r in responsibilities], 3)))
    if requirements: bullets.append("Pré-requis : " + ", ".join(_top([str(r) for r in requirements], 3)))
    if required_skills: bullets.append("Compétences demandées : " + ", ".join(_top([str(s) for s in required_skills], 6)))

    return {
        "type": "job",
        "title": title,
        "subtitle": company or "Job description",
        "chips": _top([str(s) for s in required_skills], 8),
        "bullets": bullets,
        "updatedAt": datetime.utcnow().isoformat() + "Z"
    }

def build_profile_card(user_doc: Dict[str, Any], stats: Dict[str, Any]) -> Dict[str, Any]:
    full_name = " ".join(filter(None, [user_doc.get("firstName"), user_doc.get("lastName")])).strip() or "Utilisateur"
    email = user_doc.get("email", "")
    created = user_doc.get("createdAt") or ""
    bullets = [
        f"Email : {email}",
        f"Compte créé le : {created[:10]}" if isinstance(created, str) else "Compte créé : -",
        f"Historique : {stats.get('cv_count',0)} CV, {stats.get('job_count',0)} offres, {stats.get('quiz_count',0)} quiz"
    ]
    return {
        "type": "profile",
        "title": full_name,
        "subtitle": "Profil utilisateur",
        "chips": ["Inscrit", "Authentifié"],
        "bullets": bullets,
        "updatedAt": datetime.utcnow().isoformat() + "Z"
    }

# -------------------- HELPERS RECOMMANDATIONS --------------------
def get_user_context(user_id: str) -> Dict[str, Any]:
    """
    Récupère tout le contexte utilisateur : CV, job, matching, quiz
    """
    try:
        obj_id = ObjectId(user_id)
        
        # Récupération des données les plus récentes
        latest_cv = db.results.find_one({"user": obj_id, "type": "cv"}, sort=[("createdAt", -1)])
        latest_job = db.results.find_one({"user": obj_id, "type": "job"}, sort=[("createdAt", -1)])
        latest_match = db.results.find_one({"user": obj_id, "type": "matching"}, sort=[("createdAt", -1)])
        latest_quiz = db.results.find_one({"user": obj_id, "type": "quiz_evaluation"}, sort=[("createdAt", -1)])
        user_profile = users_collection.find_one({'_id': obj_id}, {'password': 0})
        
        context = {
            "user_profile": user_profile,
            "cv_data": None,
            "job_data": None,
            "matching_data": None,
            "quiz_data": None,
            "user_name": None
        }
        
        # Extraction du nom utilisateur
        if user_profile:
            context["user_name"] = " ".join(filter(None, [
                user_profile.get("firstName"), 
                user_profile.get("lastName")
            ])).strip() or "l'utilisateur"
        
        # Données CV
        if latest_cv and latest_cv.get("data"):
            cv_data = latest_cv["data"]
            if isinstance(cv_data, dict) and "parsed_cv" in cv_data:
                cv_data = cv_data["parsed_cv"]
            context["cv_data"] = cv_data
            # Si pas de nom du profil, utiliser celui du CV
            if not context["user_name"] and cv_data.get("name"):
                context["user_name"] = cv_data["name"]
        
        # Données Job
        if latest_job and latest_job.get("data"):
            context["job_data"] = latest_job["data"]
        
        # Données Matching
        if latest_match and latest_match.get("data"):
            context["matching_data"] = latest_match["data"]
        
        # Données Quiz
        if latest_quiz and latest_quiz.get("data"):
            context["quiz_data"] = latest_quiz["data"]
        
        return context
        
    except Exception as e:
        print(f"Erreur get_user_context: {e}")
        return {"user_name": "l'utilisateur"}

def build_rich_context_prompt(context: Dict[str, Any]) -> str:
    """
    Construit un prompt riche avec toutes les informations utilisateur
    """
    user_name = context.get("user_name", "l'utilisateur")
    cv_data = context.get("cv_data")
    job_data = context.get("job_data")
    matching_data = context.get("matching_data")
    quiz_data = context.get("quiz_data")
    
    prompt_parts = [
        f"Tu es TalentIA, l'assistant IA spécialisé en recrutement de {user_name}.",
        "Tu réponds en FRANÇAIS, de façon claire, personnalisée et bienveillante.",
        f"Tu connais {user_name} et ses informations professionnelles.",
    ]
    
    # Informations CV
    if cv_data:
        cv_info = []
        if cv_data.get("name"):
            cv_info.append(f"Nom: {cv_data['name']}")
        if cv_data.get("skills"):
            skills_str = ", ".join(str(s) for s in cv_data["skills"][:8])
            cv_info.append(f"Compétences principales: {skills_str}")
        if cv_data.get("experience"):
            exp = cv_data["experience"]
            if isinstance(exp, list) and exp:
                last_exp = exp[0]
                title = _first_non_empty(last_exp.get("job_title"), last_exp.get("title"), last_exp.get("role"))
                company = _first_non_empty(last_exp.get("company"), last_exp.get("company_name"))
                if title or company:
                    cv_info.append(f"Dernière expérience: {title or 'Poste'} chez {company or 'Entreprise'}")
        if cv_data.get("education"):
            edu = cv_data["education"]
            if isinstance(edu, list) and edu:
                degree = _first_non_empty(edu[0].get("degree"), edu[0].get("diploma"))
                if degree:
                    cv_info.append(f"Formation: {degree}")
        
        if cv_info:
            prompt_parts.append(f"\n=== PROFIL DE {user_name.upper()} ===")
            prompt_parts.extend(cv_info)
    
    # Informations Job
    if job_data:
        job_info = []
        if job_data.get("title"):
            job_info.append(f"Poste visé: {job_data['title']}")
        if job_data.get("company"):
            job_info.append(f"Entreprise: {job_data['company']}")
        if job_data.get("required_skills"):
            req_skills = ", ".join(str(s) for s in job_data["required_skills"][:6])
            job_info.append(f"Compétences requises: {req_skills}")
        if job_data.get("location"):
            job_info.append(f"Lieu: {job_data['location']}")
        
        if job_info:
            prompt_parts.append(f"\n=== OFFRE D'EMPLOI ANALYSÉE ===")
            prompt_parts.extend(job_info)
    
    # Résultats de matching
    if matching_data:
        score = matching_data.get("score", 0)
        missing_keywords = matching_data.get("missing_keywords", [])
        weak_areas = matching_data.get("weak_areas", [])
        
        match_info = [f"Score de compatibilité: {score:.1f}%"]
        if missing_keywords:
            match_info.append(f"Compétences manquantes: {', '.join(str(s) for s in missing_keywords[:5])}")
        if weak_areas:
            match_info.append(f"Points d'amélioration: {', '.join(str(s) for s in weak_areas[:3])}")
        
        prompt_parts.append(f"\n=== RÉSULTATS D'ANALYSE ===")
        prompt_parts.extend(match_info)
    
    # Résultats de quiz
    if quiz_data:
        percentage = quiz_data.get("percentage", 0)
        detailed_results = quiz_data.get("detailed_results", [])
        wrong_areas = [r.get("skill_area") for r in detailed_results if not r.get("is_correct")]
        
        quiz_info = [f"Score au quiz: {percentage:.1f}%"]
        if wrong_areas:
            wrong_unique = list(dict.fromkeys(wrong_areas))[:3]  # Supprime doublons
            quiz_info.append(f"Domaines à travailler: {', '.join(wrong_unique)}")
        
        prompt_parts.append(f"\n=== ÉVALUATION DES CONNAISSANCES ===")
        prompt_parts.extend(quiz_info)
    
    prompt_parts.append(f"\nUtilise ces informations pour personnaliser tes réponses et aider {user_name} dans sa recherche d'emploi.")
    
    return "\n".join(prompt_parts)

# -------------------- API FORMATIONS --------------------



def generate_ai_only_formation_recommendations(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Génère des recommandations de formation UNIQUEMENT avec l'IA Gemini
    """
    try:
        user_name = context.get("user_name", "l'utilisateur")
        cv_data = context.get("cv_data")
        job_data = context.get("job_data") 
        matching_data = context.get("matching_data")
        quiz_data = context.get("quiz_data")
        
        # Construction du prompt détaillé
        prompt_parts = [
            f"Tu es un expert en formation professionnelle et en développement de carrière.",
            f"Analyse le profil complet de {user_name} et génère des recommandations de formation personnalisées.",
            f"",
            f"=== PROFIL UTILISATEUR : {user_name} ===",
        ]
        
        # Informations du CV
        if cv_data:
            prompt_parts.append(" INFORMATIONS CV :")
            
            if cv_data.get("name"):
                prompt_parts.append(f"• Nom : {cv_data['name']}")
            
            # Compétences actuelles
            if cv_data.get("skills"):
                skills_list = ", ".join(str(s) for s in cv_data["skills"][:10])
                prompt_parts.append(f"• Compétences actuelles : {skills_list}")
            
            # Expérience
            if cv_data.get("experience") and isinstance(cv_data["experience"], list):
                exp = cv_data["experience"]
                if exp:
                    last_exp = exp[0]
                    title = _first_non_empty(last_exp.get("job_title"), last_exp.get("title"), last_exp.get("role"))
                    company = _first_non_empty(last_exp.get("company"), last_exp.get("company_name"))
                    duration = last_exp.get("duration", "")
                    if title:
                        exp_info = f"• Dernière expérience : {title}"
                        if company:
                            exp_info += f" chez {company}"
                        if duration:
                            exp_info += f" ({duration})"
                        prompt_parts.append(exp_info)
            
            # Formation
            if cv_data.get("education") and isinstance(cv_data["education"], list):
                edu = cv_data["education"]
                if edu:
                    degree = _first_non_empty(edu[0].get("degree"), edu[0].get("diploma"))
                    if degree:
                        prompt_parts.append(f"• Formation actuelle : {degree}")
        
        # Informations du poste visé
        if job_data:
            prompt_parts.append("")
            prompt_parts.append(" POSTE VISÉ :")
            
            if job_data.get("title"):
                prompt_parts.append(f"• Titre : {job_data['title']}")
            
            if job_data.get("company"):
                prompt_parts.append(f"• Entreprise : {job_data['company']}")
                
            if job_data.get("required_skills"):
                req_skills = ", ".join(str(s) for s in job_data["required_skills"][:8])
                prompt_parts.append(f"• Compétences requises : {req_skills}")
            
            if job_data.get("responsibilities"):
                resp = "; ".join(str(r) for r in job_data["responsibilities"][:3])
                prompt_parts.append(f"• Responsabilités principales : {resp}")
        
        # Résultats de matching CV/Job
        if matching_data:
            prompt_parts.append("")
            prompt_parts.append("ANALYSE DE COMPATIBILITÉ CV/JOB :")
            
            score = matching_data.get("score", 0)
            prompt_parts.append(f"• Score de compatibilité : {score:.1f}%")
            
            missing_keywords = matching_data.get("missing_keywords", [])
            if missing_keywords:
                missing_str = ", ".join(str(k) for k in missing_keywords[:6])
                prompt_parts.append(f"• Compétences manquantes CRITIQUES : {missing_str}")
            
            weak_areas = matching_data.get("weak_areas", [])
            if weak_areas:
                weak_str = ", ".join(str(w) for w in weak_areas[:4])
                prompt_parts.append(f"• Domaines faibles identifiés : {weak_str}")
        
        # Résultats du quiz technique
        if quiz_data:
            prompt_parts.append("")
            prompt_parts.append(" ÉVALUATION TECHNIQUE (QUIZ) :")
            
            percentage = quiz_data.get("percentage", 0)
            prompt_parts.append(f"• Score obtenu : {percentage:.1f}%")
            
            detailed_results = quiz_data.get("detailed_results", [])
            if detailed_results:
                # Compétences échouées
                failed_skills = []
                correct_skills = []
                
                for result in detailed_results:
                    skill_area = result.get("skill_area", "Général")
                    if result.get("is_correct"):
                        correct_skills.append(skill_area)
                    else:
                        failed_skills.append(skill_area)
                
                # Supprimer les doublons en préservant l'ordre
                unique_failed = list(dict.fromkeys(failed_skills))
                unique_correct = list(dict.fromkeys(correct_skills))
                
                if unique_failed:
                    failed_str = ", ".join(unique_failed[:5])
                    prompt_parts.append(f"• Compétences techniques ÉCHOUÉES : {failed_str}")
                
                if unique_correct:
                    correct_str = ", ".join(unique_correct[:5])
                    prompt_parts.append(f"• Compétences techniques MAÎTRISÉES : {correct_str}")
        
        # Instructions pour l'IA
        prompt_parts.extend([
            "",
            "=== MISSION ===",
            f"Basé sur cette analyse complète de {user_name}, génère des recommandations de formation TRÈS personnalisées :",
            "",
            "1. IDENTIFIE les 3-5 compétences les PLUS PRIORITAIRES à développer",
            "2. Pour chaque compétence, PROPOSE une formation spécifique avec :",
            "   - Nom exact de la formation",
            "   - Organisme/plateforme (ex: OpenClassrooms, Coursera, Udemy, LinkedIn Learning, FUN MOOC, etc.)",
            "   - URL si tu la connais",
            "   - Durée estimée",
            "   - Niveau requis",
            "   - Justification personnalisée",
            "",
            "3. PRIORISE les formations selon :",
            f"   - Les lacunes identifiées dans le quiz de {user_name}",
            f"   - Les compétences manquantes pour le poste visé",
            f"   - Le niveau actuel de {user_name}",
            "",
            "4. VARIE les types de formations :",
            "   - Formations techniques (programmation, outils)",
            "   - Certifications professionnelles", 
            "   - Soft skills si nécessaire",
            "",
            "5. ADAPTE selon le domaine détecté :",
            "   - Si IT : formations en programmation, DevOps, data, cybersécurité...",
            "   - Si Marketing : formations en digital marketing, analytics, design...",
            "   - Si Finance : formations en analyse financière, Excel, Power BI...",
            "   - Si RH : formations en gestion des talents, droit social...",
            "   - Etc.",
            "",
            "RÉPONDS en JSON avec cette structure exacte :",
            """{
    "user_analysis": {
        "name": "...",
        "current_domain": "...",
        "experience_level": "débutant/intermédiaire/expert",
        "target_role": "...",
        "main_gaps": ["gap1", "gap2", "gap3"]
    },
    "priority_skills": [
        {
            "skill": "nom_competence",
            "priority": "haute/moyenne/basse",
            "reason": "justification personnalisée"
        }
    ],
    "formations": [
        {
            "title": "nom exact de la formation",
            "provider": "organisme",
            "url": "lien si connu ou null",
            "duration": "durée estimée",
            "level": "niveau requis", 
            "target_skills": ["skill1", "skill2"],
            "justification": "pourquoi cette formation pour ce profil",
            "priority": "haute/moyenne/basse"
        }
    ]
}""",
            "",
            f"IMPORTANT : Sois très spécifique et personnalisé pour {user_name}. Évite les recommandations génériques !"
        ])
        
        ai_prompt = "\n".join(prompt_parts)
        
        # Appel à Gemini
        response = gemini_model.generate_content(ai_prompt)
        ai_response = response.text.strip()
        
        # Parsing du JSON
        import json
        import re
        
        try:
            # Extraire le JSON de la réponse
            json_match = re.search(r'\{.*\}', ai_response, re.DOTALL)
            if json_match:
                ai_recommendations = json.loads(json_match.group())
            else:
                # Tenter de parser toute la réponse
                ai_recommendations = json.loads(ai_response)
        except json.JSONDecodeError as e:
            print(f" Erreur parsing JSON : {e}")
            print(f"Réponse IA : {ai_response[:500]}...")
            
            # Fallback avec extraction manuelle
            ai_recommendations = {
                "user_analysis": {
                    "name": user_name,
                    "current_domain": "Non déterminé",
                    "experience_level": "intermédiaire",
                    "target_role": "Poste recherché",
                    "main_gaps": ["Compétences techniques", "Certification", "Expérience pratique"]
                },
                "priority_skills": [
                    {"skill": "Compétence principale", "priority": "haute", "reason": "Identifiée par l'analyse"}
                ],
                "formations": [],
                "ai_response_raw": ai_response  # Pour debug
            }
        
        # Validation et enrichissement
        formations = ai_recommendations.get("formations", [])
        priority_skills = ai_recommendations.get("priority_skills", [])
        user_analysis = ai_recommendations.get("user_analysis", {})
        
        return {
            "success": True,
            "user_name": user_name,
            "user_analysis": user_analysis,
            "priority_skills": [skill.get("skill") for skill in priority_skills],
            "formations": formations,
            "context_used": {
                "has_cv": bool(cv_data),
                "has_job": bool(job_data),
                "has_matching": bool(matching_data),
                "has_quiz": bool(quiz_data),
                "quiz_score": quiz_data.get("percentage", 0) if quiz_data else 0,
                "matching_score": matching_data.get("score", 0) if matching_data else 0
            },
            "ai_response_raw": ai_response  # Pour debug si nécessaire
        }
        
    except Exception as e:
        print(f"Erreur génération recommandations IA : {e}")
        return {
            "success": False,
            "error": str(e),
            "user_name": context.get("user_name", "l'utilisateur"),
            "priority_skills": [],
            "formations": []
        }    

# -------------------- AUTH --------------------
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    email = data.get('email'); password = data.get('password')
    firstName = data.get('firstName'); lastName = data.get('lastName')
    if not email or not password:
        return jsonify({'success': False, 'error': 'Email et mot de passe requis'}), 400
    if users_collection.find_one({'email': email}):
        return jsonify({'success': False, 'error': 'Email déjà utilisé'}), 409

    pw_hash = bcrypt.generate_password_hash(password).decode('utf-8')
    user = {'email': email, 'password': pw_hash, 'firstName': firstName, 'lastName': lastName,
            'createdAt': datetime.now(timezone.utc).isoformat()}
    result = users_collection.insert_one(user)

    access_token = create_access_token(identity=str(result.inserted_id), expires_delta=timedelta(hours=1))
    return jsonify({'success': True, 'message': 'Utilisateur créé',
                    'accessToken': access_token,
                    'user': {'id': str(result.inserted_id), 'email': email, 'firstName': firstName, 'lastName': lastName}}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email'); password = data.get('password')
    user = users_collection.find_one({'email': email})
    if not user:
        return jsonify({'success': False, 'error': 'Identifiant (email) incorrect'}), 401
    if not bcrypt.check_password_hash(user['password'], password):
        return jsonify({'success': False, 'error': 'Mot de passe incorrect'}), 401

    access_token = create_access_token(identity=str(user['_id']), expires_delta=timedelta(hours=1))
    return jsonify({'success': True, 'accessToken': access_token,
                    'user': {'id': str(user['_id']), 'email': user['email'],
                             'firstName': user.get('firstName'), 'lastName': user.get('lastName')}})

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_me():
    user_id = get_jwt_identity()
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({'success': False, 'error': 'ID utilisateur invalide'}), 400

    user = users_collection.find_one({'_id': obj_id}, {'password': 0})
    if not user:
        return jsonify({'success': False, 'error': 'Utilisateur introuvable'}), 404
    user['_id'] = str(user['_id'])
    return jsonify({'success': True, 'user': user})

# -------------------- ENDPOINTS UTILES --------------------
@app.route('/', methods=['GET'])
def home():
    return jsonify({'message': 'Serveur de matching CV actif',
                    'status': 'ok',
                    'endpoints': ['/api/upload','/api/parse-cv','/api/parse-job','/api/match','/api/assistant/cards','/api/assistant/recommendations','/api/chat','/api/quiz','/api/formations/recommend']})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok',
                    'model_available': bool(similarity_calculator and getattr(similarity_calculator, 'model', None)),
                    'model_type': getattr(similarity_calculator, 'model_type', 'none')})

@app.route('/api/debug/routes', methods=['GET'])
def debug_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            "endpoint": rule.endpoint,
            "methods": list(rule.methods),
            "rule": str(rule)
        })
    return jsonify({"routes": routes})

@app.route('/api/formations/test', methods=['GET'])
def test_formations():
    return jsonify({"message": "Endpoint formations actif", "available_routes": ["/api/formations/recommend", "/api/formations/search"]})

# Upload/extraction texte
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files: return jsonify({'error': 'Aucun fichier fourni'}), 400
    file = request.files['file']
    if file.filename == '': return jsonify({'error': 'Aucun fichier sélectionné'}), 400
    if not allowed_file(file.filename): return jsonify({'error': 'Type de fichier non supporté'}), 400

    tmp = os.path.join(UPLOAD_FOLDER, secure_filename(file.filename))
    file.save(tmp)
    try:
        extracted_text = extract_text(tmp)
        warning = ""
        if not extracted_text.strip():
            warning = "Aucun texte détecté. PDF scanné ? Utilisez un PDF texte ou un OCR."
        elif len(extracted_text.strip()) < 50:
            warning = "Texte très court détecté. Vérifiez la qualité du fichier."
        return jsonify({'text': extracted_text, 'filename': file.filename, 'warning': warning, 'success': True})
    except Exception as e:
        return jsonify({'error': f"Erreur d'extraction: {e}"}), 500
    finally:
        if os.path.exists(tmp): os.remove(tmp)

# Parse CV
@app.route('/api/parse-cv', methods=['POST'])
@jwt_required()
def parse_cv():
    data = request.get_json() or {}
    cv_text = (data.get('cvText') or '').strip()
    if not cv_text: return jsonify({'error': 'Texte CV manquant'}), 400

    try:
        parsed = parse_cv_with_gemini(cv_text)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
    except Exception as e:
        return jsonify({'error': f'Erreur parsing CV: {e}'}), 500

    save_result_to_db(get_jwt_identity(), "cv", parsed, {"source": "gemini_parser", "original_text_length": len(cv_text)})
    return jsonify({'parsed_cv': parsed, 'success': True})

# Parse Job
@app.route('/api/parse-job', methods=['POST'])
@jwt_required()
def parse_job_description():
    data = request.get_json() or {}
    job_text = (data.get('jobText') or '').strip()
    if not job_text: return jsonify({'error': 'Texte job description manquant'}), 400
    try:
        parsed_job = parse_job(job_text)
    except Exception as e:
        return jsonify({'error': f'Erreur parsing job: {e}'}), 500

    save_result_to_db(get_jwt_identity(), "job", parsed_job, {"source": "job_parser", "original_text_length": len(job_text)})
    return jsonify({'parsed_job': parsed_job, 'success': True})

# MATCH
@app.route('/api/match', methods=['POST'])
@jwt_required()
def calculate_matching():
    try:
        data = request.get_json() or {}
        cv_text = (data.get('cvText') or '').strip()
        job_text = (data.get('jobText') or '').strip()
        if not cv_text or not job_text:
            return jsonify({'error': 'CV et job description requis'}), 400
        if not (similarity_calculator and getattr(similarity_calculator, 'model', None)):
            return jsonify({'error': 'Modèle de similarité non disponible'}), 500

        # parse
        try:
            parsed_cv = parse_cv_with_gemini(cv_text)
            if isinstance(parsed_cv, str):
                parsed_cv = json.loads(parsed_cv)
        except Exception as e:
            return jsonify({'error': f'Erreur parsing CV: {e}'}), 500

        try:
            parsed_job = parse_job(job_text)
        except Exception as e:
            return jsonify({'error': f'Erreur parsing job: {e}'}), 500

        # autosave last job
        try:
            save_result_to_db(get_jwt_identity(), "job", parsed_job,
                              {"source": "match_endpoint_autosave", "original_text_length": len(job_text)})
        except Exception as e:
            app.logger.warning(f"Autosave job failed: {e}")

        # similarity
        sim = similarity_calculator.calculate_comprehensive_embedding_similarity(parsed_cv, parsed_job)

        # missing keywords
        cv_skills = parsed_cv.get('skills', []) if parsed_cv else []
        job_skills = parsed_job.get('required_skills', []) if parsed_job else []
        cv_skills_lower = [str(s).lower() for s in cv_skills]
        missing_keywords = [s for s in job_skills if str(s).lower() not in cv_skills_lower]

        # suggestions
        overall = sim.get('overall_similarity_score', 0)
        suggestions = []
        if overall < 40:
            suggestions.append("Votre profil semble peu adapté à ce poste.")
        elif overall < 55:
            suggestions.append("Ajoutez plus de compétences techniques mentionnées dans l'offre.")
        elif overall < 70:
            suggestions.append("Mettez davantage en avant votre expérience pertinente.")
        else:
            suggestions.append("Excellent match ! Mettez en avant vos points forts.")
        if missing_keywords:
            suggestions.append(f"À travailler : {', '.join(missing_keywords[:3])}")

        matching_data = {
            'score': overall,
            'similarity_level': sim.get('similarity_level', 'Calculé'),
            'sectional_scores': sim.get('sectional_scores', {}),
            'skill_analysis': sim.get('skill_analysis', {}),
            'weak_areas': sim.get('weak_areas', []),
            'missing_keywords': missing_keywords,
            'suggestions': suggestions,
            'method': f"Embedding similarity ({sim.get('model_used', 'sentence_transformer')})",
            'parsed_cv': parsed_cv,
            'parsed_job': parsed_job,
            'success': True
        }

        # save
        save_result_to_db(
            user_id=get_jwt_identity(),
            result_type="matching",
            data=matching_data,
            meta={"model_used": sim.get("model_used", "sentence_transformer"),
                  "cv_text_length": len(cv_text), "job_text_length": len(job_text)},
            refs={"cv_skills_count": len(cv_skills),
                  "job_skills_count": len(job_skills),
                  "missing_skills_count": len(missing_keywords)}
        )
        return jsonify(matching_data)
    except Exception as e:
        return jsonify({'error': f'Erreur matching: {e}'}), 500

# Assistant cards
@app.route('/api/assistant/cards', methods=['GET'])
@jwt_required()
def get_assistant_cards():
    try:
        user_id = get_jwt_identity()
        obj_id = ObjectId(user_id)

        user = users_collection.find_one({'_id': obj_id}, {'password': 0}) or {}

        latest_cv_result = db.results.find_one({"user": obj_id, "type": "cv"}, sort=[("createdAt", -1)])
        cv_card = None
        if latest_cv_result and latest_cv_result.get("data"):
            cv_data = latest_cv_result["data"]
            if isinstance(cv_data, dict) and "parsed_cv" in cv_data:
                cv_data = cv_data["parsed_cv"]
            cv_card = summarize_cv_for_card(cv_data)

        latest_job_result = db.results.find_one({"user": obj_id, "type": "job"}, sort=[("createdAt", -1)])
        job_card = None
        if latest_job_result and latest_job_result.get("data"):
            job_card = summarize_job_for_card(latest_job_result["data"])

        if not job_card or not cv_card:
            latest_match = db.results.find_one({"user": obj_id, "type": "matching"}, sort=[("createdAt", -1)])
            if latest_match:
                mdata = latest_match.get("data", {})
                if not job_card and isinstance(mdata.get("parsed_job"), dict):
                    job_card = summarize_job_for_card(mdata["parsed_job"])
                if not cv_card and isinstance(mdata.get("parsed_cv"), dict):
                    cv_card = summarize_cv_for_card(mdata["parsed_cv"])

        cv_count = db.results.count_documents({"user": obj_id, "type": "cv"})
        job_count = db.results.count_documents({"user": obj_id, "type": "job"})
        quiz_count = db.results.count_documents({"user": obj_id, "type": {"$in": ["quiz", "quiz_evaluation"]}})

        profile_card = build_profile_card(user, {"cv_count": cv_count, "job_count": job_count, "quiz_count": quiz_count})
        return jsonify({"success": True, "cards": {"profile": profile_card, "cv": cv_card, "job": job_card}})
    except Exception as e:
        return jsonify({"success": False, "error": f"Erreur assistant: {e}"}), 500

@app.route('/api/chat', methods=['POST'])
@jwt_required(optional=True)
def chat_with_gemini():
    """
    Chat enrichi avec contexte complet utilisateur
    """
    try:
        payload = request.get_json() or {}
        incoming = payload.get("messages", [])
        
        user_id = get_jwt_identity()
        
        # Construction du contexte riche
        if user_id:
            context = get_user_context(user_id)
            system_instruction = build_rich_context_prompt(context)
        else:
            system_instruction = (
                "Tu es TalentIA, un assistant IA spécialisé en recrutement. "
                "Tu réponds en FRANÇAIS, de façon claire et concise. "
                "L'utilisateur n'est pas connecté, encourage-le à se connecter pour un service personnalisé."
            )
        
        # Construction de l'historique
        history = []
        for m in incoming:
            role = m.get("role")
            content = m.get("content", "")
            if role == "user":
                history.append({"role": "user", "parts": [content]})
            elif role == "assistant":
                history.append({"role": "model", "parts": [content]})
        
        # Génération de la réponse
        chat_model = genai.GenerativeModel("gemini-1.5-flash", system_instruction=system_instruction)
        resp = chat_model.generate_content(history if history else [{"role": "user", "parts": ["Bonjour"]}])
        
        text = (resp.text or "").strip() or "(Réponse vide)"
        
        return jsonify({"message": {"role": "assistant", "content": text}, "success": True})
        
    except Exception as e:
        return jsonify({"error": f"Erreur chat: {e}"}), 500

# -------------------- FORMATIONS ENDPOINTS --------------------
@app.route('/api/formations/recommend', methods=['POST'])
@jwt_required()
def formations_recommend_endpoint():
    """
    Génère des recommandations de formations personnalisées basées sur l'IA uniquement
    """
    try:
        user_id = get_jwt_identity()
        context = get_user_context(user_id)
        
        # Vérification des données minimales
        has_data = any([
            context.get("cv_data"),
            context.get("job_data"), 
            context.get("matching_data"),
            context.get("quiz_data")
        ])
        
        if not has_data:
            return jsonify({
                "success": False, 
                "error": "Données insuffisantes. Veuillez :\n1. Uploader votre CV\n2. Analyser une offre d'emploi\n3. Passer un quiz technique"
            }), 400
        
        # Génération avec IA uniquement
        recommendations = generate_ai_only_formation_recommendations(context)
        
        if not recommendations.get("success"):
            return jsonify({
                "success": False,
                "error": recommendations.get("error", "Erreur lors de la génération")
            }), 500
        
        # Sauvegarde des recommandations
        save_result_to_db(
            user_id,
            "formation_recommendations", 
            recommendations,
            meta={
                "source": "ai_only_gemini", 
                "formations_count": len(recommendations.get("formations", [])),
                "context_score": {
                    "quiz": recommendations.get("context_used", {}).get("quiz_score", 0),
                    "matching": recommendations.get("context_used", {}).get("matching_score", 0)
                }
            },
            refs={
                "priority_skills_count": len(recommendations.get("priority_skills", [])),
                "has_quiz_results": bool(context.get("quiz_data"))
            }
        )
        
        return jsonify({
            "success": True,
            "recommendations": recommendations
        })
        
    except Exception as e:
        print(f" Erreur dans formations_recommend_endpoint: {e}")
        return jsonify({
            "success": False, 
            "error": f"Erreur serveur: {e}"
        }), 500



# -------------------- QUIZ --------------------
# Helpers additionnels pour extraire proprement les compétences du CV
def _normalize_skill_list(skills_raw) -> List[str]:
    """
    Accepte une liste de strings ou d'objets et renvoie une liste de noms de compétences (strings).
    Exemples d'objets supportés: {"name": "Python"}, {"skill": "Docker"}, {"title": "Kubernetes"}
    """
    if not isinstance(skills_raw, list):
        return []
    out = []
    for s in skills_raw:
        if isinstance(s, str):
            name = s.strip()
        elif isinstance(s, dict):
            name = _first_non_empty(s.get("name"), s.get("skill"), s.get("title"), s.get("label"))
        else:
            name = None
        if name:
            out.append(name)
    # unicité en conservant l'ordre
    seen = set()
    uniq = []
    for n in out:
        low = n.lower()
        if low not in seen:
            uniq.append(n)
            seen.add(low)
    return uniq

def _pick_focus_skills_from_cv(parsed_cv: Dict[str, Any], max_n: int = 8) -> List[str]:
    """
    Récupère les compétences du CV (avec normalisation) et en sélectionne jusqu'à max_n.
    """
    skills_raw = (parsed_cv or {}).get("skills", []) or []
    skills = _normalize_skill_list(skills_raw)
    return skills[:max_n]

@app.route('/api/quiz', methods=['POST'])
@jwt_required()
def generate_quiz():
    """
    Génère un quiz ciblé SUR LES COMPÉTENCES DU CV.
    """
    data = request.get_json() or {}
    level = data.get('level', 'moyen')
    count = data.get('count', 5)
    user_id = get_jwt_identity()

    if not quiz_generator:
        return jsonify({'error': 'Générateur non disponible'}), 500

    # 1) Récupère le dernier CV parsé
    latest_cv_doc = db.results.find_one({"user": ObjectId(user_id), "type": "cv"}, sort=[("createdAt", -1)])
    if not latest_cv_doc or not latest_cv_doc.get("data"):
        return jsonify({
            'error': "Aucun CV trouvé. Veuillez uploader et parser votre CV avant de générer un quiz ciblé."
        }), 400

    cv_data = latest_cv_doc["data"]
    parsed_cv = cv_data["parsed_cv"] if isinstance(cv_data, dict) and "parsed_cv" in cv_data else cv_data

    # 2) Profil utilisateur
    profile = {
        'name': parsed_cv.get('name', 'Candidat'),
        'skills': parsed_cv.get('skills', []),
        'education': parsed_cv.get('education', []),
        'experience': parsed_cv.get('experience', []),
        'languages': parsed_cv.get('languages', []),
        'certifications': parsed_cv.get('certifications', []),
    }

    # 3) Compétences ciblées
    focus_skills = _pick_focus_skills_from_cv(parsed_cv, max_n=8)
    if not focus_skills:
        return jsonify({
            'error': "Votre CV ne contient pas de compétences exploitables."
        }), 400

    # 4) Génération du quiz
    level_map = {'facile': 'débutant', 'moyen': 'intermédiaire', 'difficile': 'avancé'}
    mapped_level = level_map.get(level, 'intermédiaire')

    try:
        quiz = quiz_generator.generate_quiz(
            user_profile=profile,
            level=mapped_level,
            num_questions=count,
            focus_skills=focus_skills
        )
    except TypeError:
        quiz = quiz_generator.generate_quiz(
            user_profile=profile,
            level=mapped_level,
            num_questions=count
        )

    if not quiz:
        return jsonify({'error': 'Génération échouée'}), 500

    # 5) Normalisation des questions
    questions = []
    for i, q in enumerate(quiz.questions):
        clean_choices = [(opt.split(') ', 1)[1] if ') ' in opt else opt) for opt in q.options]
        questions.append({
            'id': i,
            'question': q.question,
            'choices': clean_choices,
            'answerIndex': q.correct_answer,
            'explanation': q.explanation,
            'skillArea': q.skill_area
        })

    quiz_data = {
        'success': True,
        'questions': questions,
        'quiz_info': {
            'title': quiz.title,
            'description': quiz.description,
            'estimated_duration': quiz.estimated_duration,
            'level': level,
            'profile_used': profile.get('name', 'Utilisateur'),
            'skills_detected': len(profile.get('skills', [])),
            'focus_skills': focus_skills
        }
    }

    # 6) Sauvegarde SANS score initial
    save_result_to_db(
        user_id,
        "quiz",
        quiz_data,
        meta={
            "level": level,
            "mapped_level": mapped_level,
            "questions_count": count,
            "generated_questions": len(questions),
            "profile_source": "cv_parsing",
            "using_cv_skills": True,
            "focus_skills_count": len(focus_skills)
        }
    )
    return jsonify(quiz_data)

def get_user_profile_from_cv(user_id):
    try:
        latest_cv = db.results.find_one({"user": ObjectId(user_id), "type": "cv"}, sort=[("createdAt", -1)])
        if latest_cv and latest_cv.get('data'):
            cv_data = latest_cv['data']
            cv_parsed = cv_data['parsed_cv'] if isinstance(cv_data, dict) and 'parsed_cv' in cv_data else cv_data
            return {'name': cv_parsed.get('name', 'Candidat'),
                    'skills': cv_parsed.get('skills', []),
                    'education': cv_parsed.get('education', []),
                    'experience': cv_parsed.get('experience', []),
                    'languages': cv_parsed.get('languages', []),
                    'certifications': cv_parsed.get('certifications', [])}
        else:
            # Fallback: profil générique (utilisé ailleurs)
            user = users_collection.find_one({'_id': ObjectId(user_id)}) or {}
            return {'name': f"{user.get('firstName','')} {user.get('lastName','')}".strip() or 'Candidat',
                    'skills': ['Développement', 'Programmation', 'Informatique'],
                    'education': [{'degree': 'Formation générale'}],
                    'experience': [{'title': 'Expérience professionnelle', 'duration': 'Variable'}],
                    'languages': ['Français'], 'certifications': []}
    except Exception as e:
        print(f"Profil CV error: {e}")
        return {'name': 'Candidat', 'skills': ['JavaScript', 'Python', 'HTML', 'CSS', 'React'],
                'education': [{'degree': 'Formation dev'}], 'experience': [{'title': 'Développeur', 'duration': '2 ans'}],
                'languages': ['Français'], 'certifications': []}

@app.route('/api/quiz/profile-status', methods=['GET'])
@jwt_required()
def get_quiz_profile_status():
    try:
        user_id = get_jwt_identity()
        latest_cv = db.results.find_one({"user": ObjectId(user_id), "type": "cv"}, sort=[("createdAt", -1)])
        if latest_cv:
            cv_data = latest_cv.get('data', {})
            cv_parsed = cv_data['parsed_cv'] if isinstance(cv_data, dict) and 'parsed_cv' in cv_data else cv_data
            return jsonify({'has_cv': True, 'profile_name': cv_parsed.get('name', 'Candidat'),
                            'skills_count': len(cv_parsed.get('skills', [])),
                            'experience_count': len(cv_parsed.get('experience', [])),
                            'last_updated': latest_cv.get('createdAt'),
                            'recommendation': 'Quiz personnalisé basé sur votre CV'})
        else:
            return jsonify({'has_cv': False, 'profile_name': 'Profil générique', 'skills_count': 5, 'experience_count': 1,
                            'last_updated': None, 'recommendation': 'Uploadez votre CV pour des quiz personnalisés'})
    except Exception as e:
        return jsonify({'error': f'Erreur statut: {e}'}), 500
    
@app.route('/api/quiz/evaluate', methods=['POST'])
@jwt_required()
def evaluate_quiz():
    try:
        data = request.get_json() or {}
        answers = data.get('answers', {})
        questions_data = data.get('questions', [])
        if not questions_data:
            return jsonify({'error': "Questions manquantes"}), 400

        # Reconstruction des questions 
        quiz_questions = []
        for q in questions_data:
            quiz_questions.append(QuizQuestion(
                question=q['question'],
                options=q['choices'],
                correct_answer=q['answerIndex'],
                explanation=q.get('explanation', ''),
                skill_area=q.get('skillArea', 'Général'),
                difficulty=q.get('difficulty', 'moyen')
            ))

        # Création du quiz + évaluation 
        quiz = Quiz(
            title="Évaluation Candidat",
            description="Quiz évalué par Gemini",
            level="moyen",
            questions=quiz_questions,
            estimated_duration=len(quiz_questions)*2
        )
        evaluator = QuizEvaluator()
        results = evaluator.evaluate_answers(
            quiz,
            {i: answers.get(str(q.get('id', i)), -1) for i, q in enumerate(questions_data)}
        )

        # Résultats détaillés 
        detailed_results = []
        for i, ua in enumerate(results.user_answers):
            q = quiz.questions[i]
            user_index = ua.selected_option
            user_text = q.options[user_index] if user_index >= 0 else "Aucune réponse"
            detailed_results.append({
                'question_id': i,
                'question': q.question,
                'user_answer': user_text,
                'correct_answer': q.options[q.correct_answer],
                'is_correct': ua.is_correct,
                'explanation': q.explanation,
                'skill_area': q.skill_area
            })

        percentage = round(results.percentage, 1)
        feedback = generate_feedback(percentage, detailed_results)

        evaluation_data = {
            'success': True,
            'score': results.score,
            'total': results.total_questions,
            'percentage': percentage,
            'detailed_results': detailed_results,
            'feedback': feedback
        }

        user_id = get_jwt_identity()
        
        meta = {
            "questions_count": len(questions_data),
            "answers_provided": len([a for a in answers.values() if a >= 0]),
            "evaluation_method": "gemini_evaluator",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        refs = {
            "score": results.score,
            "total_questions": results.total_questions, 
            "percentage": results.percentage,
            "correct_answers": results.score,
            "wrong_answers": results.total_questions - results.score
        }
        
        # Sauvegarde avec la fonction améliorée
        result_id = save_result_to_db(user_id, "quiz_evaluation", evaluation_data, meta, refs)
        
        if result_id:
            print(f"Évaluation quiz sauvegardée: {percentage}% (ID: {result_id})")
        else:
            print(" Échec sauvegarde évaluation quiz")

        return jsonify(evaluation_data)

    except Exception as e:
        print(f" Erreur evaluate_quiz: {e}")
        return jsonify({'error': f'Erreur évaluation: {e}'}), 500



# -------------------- RESULTS API --------------------
@app.route('/api/results', methods=['POST'])
@jwt_required()
def save_result():
    data = request.get_json() or {}
    if "type" not in data or "data" not in data: return jsonify({"error": "type & data requis"}), 400
    user_id = get_jwt_identity()
    result = create_result(user_id, data["type"], data["data"], data.get("meta"), data.get("refs"))
    db.results.insert_one(result)
    result["_id"] = str(result["_id"]); result["user"] = str(result["user"])
    return jsonify(result), 201

@app.route('/api/results', methods=['GET'])
@jwt_required()
def get_results():
    user_id = get_jwt_identity()
    type_filter = request.args.get("type"); page = int(request.args.get("page", 1)); limit = int(request.args.get("limit", 20))
    query = {"user": ObjectId(user_id)}; 
    if type_filter: query["type"] = type_filter
    cursor = db.results.find(query).sort("createdAt", -1).skip((page-1)*limit).limit(limit)
    results = []
    for r in cursor:
        r["_id"] = str(r["_id"]); r["user"] = str(r["user"]); results.append(r)
    return jsonify(results), 200

# -------------------- ERRORS --------------------
@app.errorhandler(404)
def not_found(error): return jsonify({'error': 'Endpoint non trouvé'}), 404

@app.errorhandler(500)
def internal_error(error): return jsonify({'error': 'Erreur interne du serveur'}), 500

# -------------------- RUN --------------------
if __name__ == '__main__':
    print("🚀 Server up on :3001")
    print("📍 Endpoints formations disponibles:")
    print("  - POST /api/formations/recommend")
    print("  - GET /api/formations/search")
    print("  - GET /api/formations/test")
    app.run(debug=True, host='0.0.0.0', port=3001, threaded=True)