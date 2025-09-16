import React, { useState } from "react";
import { Sparkles, CheckCircle2, XCircle, Loader2, Trophy, Target, BookOpen, AlertCircle } from "lucide-react";

export default function QuizSection() {
  const [level, setLevel] = useState("facile");
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [quizInfo, setQuizInfo] = useState(null);
  const [showResults, setShowResults] = useState(false);
  

  const allAnswered = questions.length > 0 && questions.every(q => answers[q.id] !== undefined);
  const disabled = loading;

  // Fonction helper pour récupérer le token compatible avec votre système existant
  const getAuthHeaders = () => {
    // Vérifie dans sessionStorage (utilisé par userApiService) puis localStorage
    const token = sessionStorage.getItem('authToken') || localStorage.getItem('accessToken');
    if (!token) {
      throw new Error('Token d\'authentification manquant. Veuillez vous connecter.');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  async function generate() {
    setLoading(true);
    setError("");
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setShowResults(false);
    setQuizInfo(null);

    try {
      const headers = getAuthHeaders();
      
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers,
        body: JSON.stringify({ level, count: parseInt(count) }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : {};

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expirée. Veuillez vous reconnecter.");
        }
        throw new Error(data?.error || "Génération du quiz impossible");
      }
      
      if (!data.questions || data.questions.length === 0) {
        throw new Error("Aucune question générée");
      }

      setQuestions(data.questions);
      setQuizInfo(data.quiz_info || null);

    } catch (e) {
      setError(e.message || "Erreur lors de la génération du quiz");
      console.error("Erreur quiz:", e);
    } finally {
      setLoading(false);
    }
  }

  function choose(qid, idx) {
    setAnswers(a => ({ ...a, [qid]: idx }));
  }

  async function correct() {
    if (!questions.length) return;

    setLoading(true);
    setError("");

    try {
      const headers = getAuthHeaders();
      
      // APPEL À L'API BACKEND pour évaluation ET sauvegarde
      const res = await fetch("/api/quiz/evaluate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          answers: answers,
          questions: questions
        }),
      });

      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : {};

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Session expirée. Veuillez vous reconnecter.");
        }
        throw new Error(data?.error || "Erreur lors de l'évaluation du quiz");
      }

      // Les données viennent maintenant du backend (avec sauvegarde automatique)
      setResult({
        score: data.score,
        total: data.total,
        percentage: data.percentage,
        feedback: data.feedback,
        details: data.detailed_results // Utiliser les résultats détaillés du backend
      });
      
      setShowResults(true);
      
      console.log(`✅ Quiz évalué et sauvegardé: ${data.percentage}% (${data.score}/${data.total})`);

    } catch (e) {
      setError("Erreur lors de l'évaluation: " + e.message);
      console.error("Erreur évaluation:", e);
    } finally {
      setLoading(false);
    }
  }

  function resetQuiz() {
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setShowResults(false);
    setQuizInfo(null);
    setError("");
  }
  

  // Vérification de l'authentification compatible avec votre système
  const isAuthenticated = () => {
    return !!(sessionStorage.getItem('authToken') || localStorage.getItem('accessToken'));
  };

  // Si pas connecté, afficher un message
  if (!isAuthenticated()) {
    return (
      <div id="quiz" className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-600" />
          <h2 className="text-base font-semibold text-slate-800">Quiz IA Personnalisé</h2>
        </div>
        <div className="card p-6 bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h3 className="font-semibold text-yellow-800">Authentification requise</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Veuillez vous connecter pour accéder aux quiz personnalisés.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="quiz" className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base font-semibold text-slate-800">Quiz IA Personnalisé</h2>
      </div>

      {/* Configuration du quiz */}
      {questions.length === 0 && !showResults && (
        <div className="card p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Niveau</label>
              <select value={level} onChange={e => setLevel(e.target.value)} className="input mt-1" disabled={disabled}>
                <option value="facile">Facile - Débutant</option>
                <option value="moyen">Moyen - Intermédiaire</option>
                <option value="difficile">Difficile - Avancé</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Questions</label>
              <select value={count} onChange={e => setCount(Number(e.target.value))} className="input mt-1" disabled={disabled}>
                <option value="5">5 questions</option>
                <option value="10">10 questions</option>
                <option value="15">15 questions</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={generate} disabled={disabled} className="btn btn-primary disabled:opacity-50 flex items-center gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Génération...</> : <><Target className="h-4 w-4" /> Générer le quiz</>}
            </button>
            <button onClick={resetQuiz} className="btn btn-outline flex items-center gap-2" disabled={loading}>Réinitialiser</button>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
        </div>
      )}

      {/* Quiz et questions */}
      {questions.length > 0 && !showResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Questions ({questions.length})</h3>
            <div className="text-sm text-slate-600">Répondu: {Object.keys(answers).length}/{questions.length}</div>
          </div>

          {questions.map((q, i) => (
            <div key={q.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="mb-3 text-sm font-medium text-slate-800">
                <span className="inline-block bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs mr-2">Q{i + 1}</span>
                {q.question}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.choices.map((c, idx) => {
                  const active = answers[q.id] === idx;
                  return (
                    <button key={idx} onClick={() => choose(q.id, idx)} className={`text-left p-3 rounded-lg border transition-all ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white hover:bg-indigo-50 border-slate-200 hover:border-indigo-300'}`}>
                      <span className="font-medium">{String.fromCharCode(65 + idx)}</span> {c}
                    </button>
                  );
                })}
              </div>
              {q.skillArea && <div className="mt-2 text-xs text-slate-500">Compétence: {q.skillArea}</div>}
            </div>
          ))}

          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg">
            <div className="text-sm text-slate-600">{allAnswered ? <span className="text-green-600 font-medium">✓ Toutes les questions ont été répondues</span> : "Répondez à toutes les questions avant de corriger"}</div>
            <button onClick={correct} disabled={!allAnswered || loading} className="btn btn-primary disabled:opacity-50 flex items-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {loading ? "Correction en cours..." : "Corriger le quiz"}
            </button>
          </div>
        </div>
      )}

      {/* Résultats */}
      {result && showResults && (
        <div className="space-y-4">
          <div className="card p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <Trophy className={`h-6 w-6 ${result.feedback.color === 'green' ? 'text-green-600' : result.feedback.color === 'blue' ? 'text-blue-600' : result.feedback.color === 'orange' ? 'text-orange-600' : 'text-red-600'}`} />
              <div>
                <h3 className="text-lg font-bold text-slate-900">Résultat: {result.feedback.level}</h3>
                <p className="text-sm text-slate-600">{result.feedback.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold text-slate-900">{result.score}/{result.total}</div>
              <div className="text-right">
                <div className="text-2xl font-bold text-indigo-600">{result.percentage}%</div>
                <div className="text-xs text-slate-500">Score final - Sauvegardé ✓</div>
              </div>
            </div>
          </div>

          {/* Détail des Questions */}
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800">Détail des réponses</h4>
            
            {result.details && result.details.map((detail, i) => {
              const question = questions.find(q => q.id === detail.question_id) || questions[i];
              const isCorrect = detail.is_correct;
              
              return (
                <div key={detail.question_id || i} className="card p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-sm font-medium text-slate-800">
                      Q{i + 1}. {detail.question || question?.question}
                    </div>
                    {isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>

                  <div className="space-y-2 mb-3">
                    <div className={`p-2 rounded border ${isCorrect ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
                      <strong>Votre réponse:</strong> {detail.user_answer}
                      {isCorrect ? ' ✓' : ' ✗'}
                    </div>
                    {!isCorrect && (
                      <div className="p-2 rounded border bg-green-100 text-green-800 border-green-300">
                        <strong>Réponse correcte:</strong> {detail.correct_answer} ✓
                      </div>
                    )}
                  </div>

                  {detail.explanation && (
                    <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded border-l-4 border-blue-400">
                      <strong>Explication:</strong> {detail.explanation}
                    </div>
                  )}
                  
                  {detail.skill_area && (
                    <div className="mt-2 text-xs text-slate-500">
                      Compétence: {detail.skill_area}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button onClick={resetQuiz} className="btn btn-primary">
              Nouveau quiz
            </button>
            <button onClick={() => setShowResults(false)} className="btn btn-outline">
              Revoir les questions
            </button>
          </div>
        </div>
      )}
    </div>
  );
}