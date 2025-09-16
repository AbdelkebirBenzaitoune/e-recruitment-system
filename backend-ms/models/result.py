from datetime import datetime
from bson import ObjectId
from typing import Dict, Any, Optional

# Types de résultats supportés
SUPPORTED_RESULT_TYPES = {
    "cv": "Résultats de parsing de CV",
    "job": "Résultats de parsing d'offre d'emploi", 
    "matching": "Résultats d'analyse de compatibilité CV/Job",
    "quiz": "Génération de quiz (questions seulement)",
    "quiz_evaluation": "Évaluation/correction de quiz (avec scores)",
    "formation_recommendations": "Recommandations de formations personnalisées",
    "chat": "Historique de conversations avec l'assistant",
    "profile_analysis": "Analyses de profil utilisateur"
}

def create_result(user_id: str, result_type: str, data: Dict[str, Any], 
                 meta: Optional[Dict[str, Any]] = None, 
                 refs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Crée un document result standardisé pour MongoDB
    
    Args:
        user_id: ID de l'utilisateur (string, sera converti en ObjectId)
        result_type: Type de résultat (doit être dans SUPPORTED_RESULT_TYPES)
        data: Données principales du résultat
        meta: Métadonnées optionnelles (infos sur le traitement, modèles utilisés, etc.)
        refs: Références optionnelles (IDs liés, scores, compteurs, etc.)
    
    Returns:
        Document MongoDB prêt à être inséré
    """
    
    # Validation du type
    if result_type not in SUPPORTED_RESULT_TYPES:
        print(f"Type '{result_type}' non reconnu. Types supportés: {list(SUPPORTED_RESULT_TYPES.keys())}")
        # Ne pas faire échouer, mais logger pour debug
    
    # Validation des données essentielles
    if not data:
        print(f"Données vides pour result_type '{result_type}'")
    
    return {
        "user": ObjectId(user_id),
        "type": result_type,
        "data": data,
        "meta": meta or {},
        "refs": refs or {},
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        # Ajout d'un champ version pour la migration future si nécessaire
        "schema_version": "1.0"
    }

def create_quiz_result(user_id: str, quiz_data: Dict[str, Any], 
                      meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Crée spécifiquement un résultat de génération de quiz
    """
    default_meta = {
        "source": "quiz_generator",
        "questions_count": len(quiz_data.get("questions", [])),
        "level": quiz_data.get("quiz_info", {}).get("level", "unknown")
    }
    if meta:
        default_meta.update(meta)
    
    return create_result(user_id, "quiz", quiz_data, default_meta)

def create_quiz_evaluation_result(user_id: str, evaluation_data: Dict[str, Any],
                                meta: Optional[Dict[str, Any]] = None,
                                refs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Crée spécifiquement un résultat d'évaluation de quiz (avec scores)
    """
    default_meta = {
        "source": "quiz_evaluator", 
        "questions_count": len(evaluation_data.get("detailed_results", [])),
        "evaluation_timestamp": datetime.utcnow().isoformat()
    }
    if meta:
        default_meta.update(meta)
    
    default_refs = {
        "score": evaluation_data.get("score", 0),
        "total_questions": evaluation_data.get("total", 0),
        "percentage": evaluation_data.get("percentage", 0.0),
        "feedback_level": evaluation_data.get("feedback", {}).get("level", "unknown")
    }
    if refs:
        default_refs.update(refs)
    
    return create_result(user_id, "quiz_evaluation", evaluation_data, default_meta, default_refs)

def create_formation_recommendations_result(user_id: str, recommendations_data: Dict[str, Any],
                                          meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Crée spécifiquement un résultat de recommandations de formations
    """
    default_meta = {
        "source": "ai_formation_recommender",
        "formations_count": len(recommendations_data.get("formations", [])),
        "priority_skills_count": len(recommendations_data.get("priority_skills", [])),
        "generation_timestamp": datetime.utcnow().isoformat()
    }
    if meta:
        default_meta.update(meta)
    
    return create_result(user_id, "formation_recommendations", recommendations_data, default_meta)

# Fonctions utilitaires pour récupérer les résultats

def get_latest_result(db, user_id: str, result_type: str) -> Optional[Dict[str, Any]]:
    """
    Récupère le résultat le plus récent d'un type donné pour un utilisateur
    """
    try:
        return db.results.find_one(
            {"user": ObjectId(user_id), "type": result_type}, 
            sort=[("createdAt", -1)]
        )
    except Exception as e:
        print(f"Erreur get_latest_result: {e}")
        return None

def get_user_results_summary(db, user_id: str) -> Dict[str, Any]:
    """
    Récupère un résumé des résultats d'un utilisateur
    """
    try:
        obj_id = ObjectId(user_id)
        summary = {}
        
        # Compter par type
        for result_type in SUPPORTED_RESULT_TYPES.keys():
            count = db.results.count_documents({"user": obj_id, "type": result_type})
            if count > 0:
                latest = db.results.find_one(
                    {"user": obj_id, "type": result_type}, 
                    sort=[("createdAt", -1)]
                )
                summary[result_type] = {
                    "count": count,
                    "latest_date": latest.get("createdAt") if latest else None
                }
        
        return summary
    except Exception as e:
        print(f"Erreur get_user_results_summary: {e}")
        return {}

# Migration utility (si vous avez des anciens résultats à migrer)
def migrate_old_results(db):
    """
    Utilitaire pour migrer d'anciens résultats vers le nouveau schéma
    """
    try:
        # Ajouter updatedAt et schema_version aux anciens documents
        result = db.results.update_many(
            {"schema_version": {"$exists": False}},
            {
                "$set": {
                    "updatedAt": datetime.utcnow(),
                    "schema_version": "1.0"
                }
            }
        )
        print(f"Migration: {result.modified_count} documents mis à jour")
        return result.modified_count
    except Exception as e:
        print(f"Erreur migration: {e}")
        return 0