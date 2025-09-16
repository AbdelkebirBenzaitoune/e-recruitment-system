import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Send, Loader2, Bot, User, Trash2, Copy, Check, MessageSquare, FileText, Briefcase, GraduationCap, ExternalLink, Star, Clock, Award, ChevronDown, X } from "lucide-react";

export default function ChatSection({
  apiUrl = "/api/chat",
  cardsApi = "/api/assistant/cards",
  formationsApi = "/api/formations/recommend",
  systemPrompt = "Tu es un assistant utile spécialisé en recrutement : tu aides à analyser des CV et des offres d'emploi, et tu réponds en français de façon claire et concise.",
  refreshKey = 0,
  autoShowCards = true
}) {
  const [messages, setMessages] = useState([
    { id: crypto.randomUUID(), role: "assistant", content: "Bonjour ! Je suis TalentIA, votre assistant IA personnalisé. Je connais votre profil et peux vous aider dans votre recherche d'emploi. Comment puis-je vous aider aujourd'hui ?" },
    { id: crypto.randomUUID(), type: "formation_cta", text: " Voulez-vous que je vous recommande des formations personnalisées basées sur votre profil ?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [formationsLoading, setFormationsLoading] = useState(false);

  const [modalCard, setModalCard] = useState(null);
  const [modalFormation, setModalFormation] = useState(null);
  const [cards, setCards] = useState({ profile: null, cv: null, job: null });
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState("");
  const [showCards, setShowCards] = useState(autoShowCards);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  const apiMessages = useMemo(() => [
    { role: "system", content: systemPrompt },
    ...messages.filter(m => !m.type).map(({ role, content }) => ({ role, content }))
  ], [messages, systemPrompt]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, showCards, cards]);

  const fetchCards = useCallback(async () => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    setCardsLoading(true);
    setCardsError("");
    try {
      const res = await fetch(cardsApi, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCards(data.cards || { profile: null, cv: null, job: null });
      if (autoShowCards) setShowCards(true);
    } catch (e) {
      setCardsError(e.message || "Impossible de charger les cartes.");
    } finally {
      setCardsLoading(false);
    }
  }, [cardsApi, autoShowCards]);

  useEffect(() => { fetchCards(); }, [fetchCards, refreshKey]);

  useEffect(() => {
    window.__chatAppend = (payload) => {
      if (!payload) return;
      let normalized = null;
      if (typeof payload === "string") {
        normalized = { id: crypto.randomUUID(), role: "assistant", content: payload };
      } else if (payload.type) {
        normalized = { id: crypto.randomUUID(), ...payload };
      } else if (payload.role && payload.content != null) {
        normalized = { id: crypto.randomUUID(), role: payload.role, content: String(payload.content) };
      }
      if (normalized) setMessages(prev => [...prev, normalized]);
    };
    return () => { delete window.__chatAppend; };
  }, []);

  const fetchFormationRecommendations = useCallback(async () => {
    setFormationsLoading(true);
    try {
      const token = sessionStorage.getItem("authToken");
      const res = await fetch(formationsApi, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        }
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      
      const recs = data.recommendations;
      if (recs) {
        const userName = recs.user_name || "vous";
        const prioritySkills = recs.priority_skills || [];
        const formations = recs.formations || [];
        
        // Message d'introduction
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant", 
          content: `D'après l'analyse de votre profil ${userName}, voici mes recommandations personnalisées :`
        }]);
        
        // Compétences prioritaires
        if (prioritySkills.length > 0) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            type: "priority_skills",
            skills: prioritySkills,
            text: `Compétences prioritaires à développer : ${prioritySkills.join(", ")}`
          }]);
        }
        
        // Formations recommandées
        if (formations.length > 0) {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            type: "formations",
            formations: formations,
            text: `${formations.length} formations personnalisées trouvées`
          }]);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: "error",
        text: e.message || "Impossible de charger les recommandations de formation"
      }]);
    } finally {
      setFormationsLoading(false);
    }
  }, [formationsApi]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setError("");
    setLoading(true);
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    setInput("");

    try {
      const token = sessionStorage.getItem("authToken");
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ messages: [...apiMessages, { role: "user", content: trimmed }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const content = data?.message?.content || data?.reply || data?.choices?.[0]?.message?.content || "(Réponse vide)";
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content }]);
    } catch (e) {
      setError("Impossible d'obtenir une réponse de l'IA.");
      console.error(e);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e) { e.preventDefault(); void sendMessage(input); }
  function handleKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); } }
  function clearChat() {
    setMessages([
      { id: crypto.randomUUID(), role: "assistant", content: "Nouveau chat démarré ! Comment puis-je vous aider ?" },
      { id: crypto.randomUUID(), type: "formation_cta", text: "💡 Voulez-vous que je vous recommande des formations personnalisées basées sur votre profil ?" }
    ]);
    setError("");
    inputRef.current?.focus();
  }
  async function copyMessage(id, text) {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1200); } catch (_) {}
  }

  return (
    <div className="h-[640px] w-full flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft">
      {/* Header modifié - sans le mot "formation" */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-purple-600 to-blue-600 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight text-white">TalentIA</h2>
            <p className="text-xs text-purple-100">Votre assistant carrière intelligent</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearChat}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-3 py-2 text-xs text-white hover:bg-white/30 transition-colors"
            title="Nouveau chat"
          >
            <MessageSquare className="h-4 w-4" /> Nouveau
          </button>
        </div>
      </div>

      {/* Zone messages */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-gradient-to-b from-purple-50/30 to-blue-50/30 p-4">
        {messages.map(m => <MessageBubble key={m.id} m={m} onCopy={copyMessage} copiedId={copiedId} onFormationClick={fetchFormationRecommendations} onFormationDetail={setModalFormation} />)}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/10 to-blue-600/10">
              <Bot className="h-5 w-5 text-purple-600" />
            </div>
            <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-purple-100 bg-gradient-to-r from-purple-50 to-blue-50 px-4 py-3 text-sm text-slate-700">
              <div className="flex items-center gap-2 text-purple-700">
                <Loader2 className="h-4 w-4 animate-spin" /> TalentIA rédige une réponse...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {error}</div>}

      {/* Input */}
      <form onSubmit={onSubmit} className="border-t border-slate-200 bg-white p-4">
        <div className="flex items-end gap-3">
          <div className=" hidden mb-2 h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-slate-800 to-slate-900 text-white sm:flex">
            <User className="h-4 w-4" />
          </div>
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez votre question à TalentIA..."
              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-3 mb-2 mt-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-lg transition-all"
            aria-label="Envoyer"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">Envoyer</span>
          </button>
        </div>
      </form>

      {modalCard && (
        <CardModal card={modalCard} onClose={() => setModalCard(null)} />
      )}
      
      {modalFormation && (
        <FormationModal formation={modalFormation} onClose={() => setModalFormation(null)} />
      )}
    </div>
  );
}

/* ===== Affichage de bulles amélioré ===== */
function MessageBubble({ m, onCopy, copiedId, onFormationClick, onFormationDetail }) {
  // CTA Formation
  if (m.type === "formation_cta") {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-green-600/10 to-emerald-600/10">
          <GraduationCap className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-900 mb-3">{m.text}</p>
          <button
            onClick={onFormationClick}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <GraduationCap className="h-4 w-4" /> Obtenir mes recommandations
          </button>
        </div>
      </div>
    );
  }

  // Compétences prioritaires
  if (m.type === "priority_skills") {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-amber-600/10 to-yellow-600/10">
          <Star className="h-5 w-5 text-amber-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold mb-2">Compétences prioritaires</div>
          <div className="flex flex-wrap gap-2">
            {(m.skills || []).map((skill, i) => (
              <span key={i} className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 border border-amber-200 text-xs font-medium">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Formations
  if (m.type === "formations") {
    const [expanded, setExpanded] = useState(false);
    const visibleFormations = expanded ? m.formations : (m.formations || []).slice(0, 3);
    const remainingCount = (m.formations || []).length - 3;

    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-blue-600/10 to-indigo-600/10">
          <GraduationCap className="h-5 w-5 text-blue-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <div className="font-semibold mb-3">Formations recommandées</div>
          <div className="space-y-3">
            {visibleFormations.map((formation, i) => (
              <FormationCard 
                key={i} 
                formation={formation} 
                onDetail={() => onFormationDetail(formation)}
              />
            ))}
            {!expanded && remainingCount > 0 && (
              <button 
                onClick={() => setExpanded(true)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mt-2"
              >
                <ChevronDown className="h-4 w-4" /> Voir {remainingCount} autres formations
              </button>
            )}
            {expanded && remainingCount > 0 && (
              <button 
                onClick={() => setExpanded(false)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium mt-2"
              >
                <ChevronDown className="h-4 w-4 rotate-180" /> Voir moins
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // message "system"
  if (m.type === "system") {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/10 to-blue-600/10">
          <Bot className="h-5 w-5 text-purple-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-slate-200 bg-white p-3 text-xs text-slate-500">
          💡 {m.text}
        </div>
      </div>
    );
  }
  // insight
  if (m.type === "insight") {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/10 to-blue-600/10">
          <Bot className="h-5 w-5 text-purple-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          {m.text}
        </div>
      </div>
    );
  }
  // certifications
  if (m.type === "certs") {
    const renderItem = (x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        const title = x.certification || x.title || x.name || "";
        const meta = [x.priority, x.relevance].filter(Boolean).join(" • ");
        return meta ? `${title} — ${meta}` : title || JSON.stringify(x);
      }
      return String(x);
    };
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-green-600/10 to-emerald-600/10">
          <Award className="h-5 w-5 text-emerald-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-semibold mb-1">🏆 Certifications suggérées</div>
          <ul className="list-disc pl-5">
            {(m.items || []).map((x, i) => <li key={i}>{renderItem(x)}</li>)}
          </ul>
        </div>
      </div>
    );
  }
  // projets
  if (m.type === "projects") {
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-amber-600/10 to-yellow-600/10">
          <FileText className="h-5 w-5 text-amber-600" />
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold mb-1">🛠️ Projets recommandés</div>
          <ul className="list-disc pl-5">
            {(m.items || []).map((x, i) => <li key={i}>{typeof x === "string" ? x : (x?.title || x?.name || JSON.stringify(x))}</li>)}
          </ul>
        </div>
      </div>
    );
  }
  // erreur
  if (m.type === "error") {
    return <div className="mx-4 my-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {m.text}</div>;
  }

  // messages classiques
  const isUser = m.role === "user";
  return (
    <div className={`flex items-start gap-3 ${isUser ? "justify-end" : ""}`}>
      {!isUser && <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-600/10 to-blue-600/10"><Bot className="h-5 w-5 text-purple-600" /></div>}
      <div className={`group relative max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? "rounded-tr-none bg-gradient-to-r from-slate-800 to-slate-900 text-white" : "rounded-tl-none border border-slate-200 bg-white text-slate-800"}`}>
        {m.content}
        {!isUser && (
          <button
            onClick={() => onCopy(m.id, m.content)}
            className={`absolute -right-2 -top-2 hidden rounded-full border bg-white p-1.5 text-slate-500 shadow-sm transition hover:text-slate-700 group-hover:inline-flex ${copiedId === m.id ? "border-green-200 bg-green-50" : "border-slate-200"}`}
            title="Copier"
          >
            {copiedId === m.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {isUser && <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-slate-800 to-slate-900 text-white"><User className="h-5 w-5" /></div>}
    </div>
  );
}

/* ===== Composants Formation améliorés ===== */
function FormationCard({ formation, onDetail }) {
  return (
    <div className="bg-white rounded-lg border border-blue-100 p-3 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-semibold text-slate-800 text-sm leading-tight mb-1">{formation.title}</h4>
          <p className="text-xs text-slate-600">{formation.provider}</p>
        </div>
        <button
          onClick={onDetail}
          className="ml-2 p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
          title="Voir détails"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
      
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
        {formation.duration && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {formation.duration}
          </span>
        )}
        {formation.level && (
          <span className="flex items-center gap-1">
            <Award className="h-3 w-3" /> {formation.level}
          </span>
        )}
      </div>
      
      {formation.target_skills && formation.target_skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {formation.target_skills.slice(0, 3).map((skill, i) => (
            <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
              {skill}
            </span>
          ))}
          {formation.target_skills.length > 3 && (
            <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-full text-xs">
              +{formation.target_skills.length - 3}
            </span>
          )}
        </div>
      )}
      
      {formation.url && (
        <div className="mt-2">
          <a 
            href={formation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 px-2 py-1 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Accéder à la formation
          </a>
        </div>
      )}
    </div>
  );
}

function FormationModal({ formation, onClose }) {
  if (!formation) return null;
  
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <div className="text-sm uppercase tracking-wide text-blue-600 font-semibold">Formation recommandée</div>
            <div className="text-lg font-bold text-slate-800 mt-0.5">{formation.title}</div>
            <div className="text-sm text-slate-600">{formation.provider}</div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-slate-500 hover:text-slate-700 rounded-full hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {formation.duration && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-xs text-slate-500">Durée</div>
                  <div className="font-medium">{formation.duration}</div>
                </div>
              </div>
            )}
            {formation.level && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                <Award className="h-5 w-5 text-blue-600" />
                <div>
                  <div className="text-xs text-slate-500">Niveau</div>
                  <div className="font-medium">{formation.level}</div>
                </div>
              </div>
            )}
          </div>
          
          {formation.description && (
            <div className="mb-4">
              <h3 className="font-semibold text-slate-800 mb-2">Description</h3>
              <p className="text-sm text-slate-600">{formation.description}</p>
            </div>
          )}
          
          {formation.target_skills && formation.target_skills.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-slate-800 mb-2">Compétences développées</h3>
              <div className="flex flex-wrap gap-2">
                {formation.target_skills.map((skill, i) => (
                  <span key={i} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {formation.skills && formation.skills.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold text-slate-800 mb-2">Programme</h3>
              <div className="flex flex-wrap gap-2">
                {formation.skills.map((skill, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-sm">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <div className="sticky bottom-0 flex justify-between items-center gap-2 px-5 py-3 border-t bg-white rounded-b-xl">
          <button 
            onClick={onClose} 
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Fermer
          </button>
          {formation.url && (
            <a
              href={formation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> Accéder à la formation
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CardModal({ card, onClose }) {
  const { kind, data } = card || {};
  if (!data) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
        <div className={`px-5 py-4 border-b
          ${kind === 'profile' ? 'bg-gradient-to-r from-sky-50 to-blue-50'
          : kind === 'cv' ? 'bg-gradient-to-r from-purple-50 to-pink-50'
          : 'bg-gradient-to-r from-amber-50 to-orange-50'}`}>
          <div className="text-sm uppercase tracking-wide text-slate-600">
            {kind === 'profile' ? 'Profil utilisateur'
              : kind === 'cv' ? 'Résumé du CV'
              : 'Résumé de l\'offre'}
          </div>
          <div className="text-lg font-semibold text-slate-800 mt-0.5">{data.title}</div>
          {data.subtitle && <div className="text-sm text-slate-600">{data.subtitle}</div>}
        </div>
        <div className="px-5 py-4">
          {data.chips?.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {data.chips.map((c, i) => <Chip key={i}>{c}</Chip>)}
            </div>
          )}
          {data.bullets?.length > 0 && (
            <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-700">
              {data.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">Fermer</button>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }) {
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200">{children}</span>;
}