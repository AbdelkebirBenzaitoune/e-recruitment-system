import React, { useRef, useState } from "react";
import userApiService from "../../services/userApiService";

export default function UploadSection({
  cvText,
  setCvText,
  setFilename,
  setParsedCv,
  parsedCv,
  jobText,
  setJobText,
  lastResult,
  setLastResult,
  onDataChanged,
}) {
  const [loading, setLoading] = useState(false);     
  const [parsing, setParsing] = useState(false);     
  const [matching, setMatching] = useState(false);   
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [localFilename, setLocalFilename] = useState("");
  const inputRef = useRef(null);
  const jobRef = useRef(null);

  const API_BASE =
    import.meta.env.VITE_API_BASE ||
    (window.location.hostname === "localhost" ? "http://localhost:3001" : "");

  const getAuthHeaders = () => {
    const token = sessionStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // ---- helpers ----
  function buildTextFromParsedCv(cv = {}) {
    const lines = [];
    const name = cv.name || cv.full_name || "Candidat";
    const headline =
      cv.headline ||
      cv.title ||
      (cv.experience?.[0]?.job_title || cv.experience?.[0]?.title) ||
      "Profil";
    lines.push(`${name} — ${headline}`);

    if (Array.isArray(cv.skills) && cv.skills.length) {
      lines.push(`Compétences: ${cv.skills.join(", ")}`);
    }
    if (Array.isArray(cv.certifications) && cv.certifications.length) {
      const certs = cv.certifications
        .map((c) => (typeof c === "string" ? c : c?.name || c?.title))
        .filter(Boolean);
      if (certs.length) lines.push(`Certifications: ${certs.join(", ")}`);
    }
    if (Array.isArray(cv.languages) && cv.languages.length) {
      const langs = cv.languages.map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
      if (langs.length) lines.push(`Langues: ${langs.join(", ")}`);
    }

    if (Array.isArray(cv.experience) && cv.experience.length) {
      lines.push("Expériences:");
      cv.experience.slice(0, 6).forEach((e) => {
        const role = e.job_title || e.title || "Poste";
        const company = e.company || e.company_name || e.employer || "Entreprise";
        const desc =
          e.description ||
          (Array.isArray(e.responsibilities) ? e.responsibilities.slice(0, 5).join("; ") : "");
        lines.push(`- ${role} @ ${company}${desc ? ` — ${desc}` : ""}`);
      });
    }

    if (Array.isArray(cv.education) && cv.education.length) {
      lines.push("Formation:");
      cv.education.slice(0, 5).forEach((ed) => {
        const deg = ed.degree || ed.diploma || ed.title || "Diplôme";
        const inst = ed.school || ed.institution || "";
        lines.push(`- ${deg}${inst ? ` — ${inst}` : ""}`);
      });
    }
    return lines.join("\n");
  }

  async function fetchLatestCvTextFromDB() {
    const res = await fetch(`${API_BASE}/api/results?type=cv&limit=1`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        throw new Error(j?.error || `HTTP ${res.status}`);
      } catch {
        throw new Error(`HTTP ${res.status}`);
      }
    }
    const list = await res.json();
    const item = Array.isArray(list) ? list[0] : null;
    const cvData = item?.data;
    if (!cvData) return null;
    const parsed = typeof cvData === "object" && cvData.parsed_cv ? cvData.parsed_cv : cvData;
    const text = buildTextFromParsedCv(parsed || {});
    return {
      text,
      filename: item?.meta?.original_filename || "Dernier CV (base)",
      parsed,
    };
  }

  // ---- upload fichier ----
  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const okTypes = [
      "application/pdf",
      "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const isOk = okTypes.includes(file.type) || /\.(pdf|txt|docx)$/i.test(file.name);
    if (!isOk) {
      setError("Type non supporté. Choisissez un PDF, TXT ou DOCX.");
      e.target.value = "";
      return;
    }

    setError("");
    setWarning("");
    setLoading(true);

    try {
      const form = new FormData();
      form.append("file", file);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errorData = await res.text();
        try {
          const errorJson = JSON.parse(errorData);
          throw new Error(errorJson.error || `Échec de l'upload (HTTP ${res.status})`);
        } catch {
          throw new Error(`Échec de l'upload (HTTP ${res.status})`);
        }
      }

      const data = await res.json();

      setCvText(data.text || "");
      setFilename?.(data.filename || file.name);
      setLocalFilename(data.filename || file.name);

      if (data.warning) setWarning(data.warning);

      if (data.text && data.text.length > 100) {
        await parseCV(data.text);
      }
    } catch (err) {
      const msg =
        err?.name === "AbortError"
          ? "Délai dépassé. Vérifiez que le serveur est démarré."
          : err?.message?.includes("Failed to fetch")
          ? "Impossible de se connecter au serveur. Vérifiez qu'il est démarré sur le port 3001."
          : err?.message || "Échec de l'upload.";
      setError(msg);
      inputRef.current && (inputRef.current.value = "");
      setLocalFilename("");
    } finally {
      setLoading(false);
    }
  }

  // ---- parse CV ----
  async function parseCV(textToparse = cvText) {
    if (!textToparse.trim()) {
      setError("Aucun texte à analyser");
      return;
    }

    setParsing(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/parse-cv`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ cvText: textToparse }),
      });

      if (!res.ok) {
        const t = await res.text();
        try {
          const j = JSON.parse(t);
          throw new Error(j?.error || "Erreur d'analyse du CV");
        } catch {
          throw new Error(`Erreur d'analyse du CV (HTTP ${res.status})`);
        }
      }

      const data = await res.json();
      setParsedCv?.(data.parsed_cv);
      onDataChanged?.(); 
    } catch (err) {
      const msg = err?.message?.includes("Failed to fetch")
        ? "Impossible de se connecter au serveur pour analyser le CV."
        : err.message || "Erreur lors de l'analyse structurée";
      setError(msg);
    } finally {
      setParsing(false);
    }
  }

  // ---- parse JD ----
  async function handleParseJob() {
    if (!jobText?.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await userApiService.parseJob(jobText.trim());
      onDataChanged?.();
    } catch (err) {
      setError(err.message || "Erreur d'analyse de l'offre");
    } finally {
      setLoading(false);
    }
  }

  // ---- matching ----
  async function computeMatching() {
    setError("");
    setWarning("");

    if (!jobText?.trim()) {
      setError("Veuillez remplir la description du poste avant d'analyser.");
      jobRef.current?.focus();
      return;
    }

    let cvTextToUse = (cvText || "").trim();
    if (!cvTextToUse) {
      try {
        const latest = await fetchLatestCvTextFromDB();
        if (!latest || !latest.text?.trim()) {
          setError(
            "Aucun CV téléversé et aucun CV trouvé en base. Veuillez téléverser un CV avant d'analyser."
          );
          inputRef.current?.focus();
          return;
        }
        cvTextToUse = latest.text;
        setCvText(latest.text);
        setParsedCv?.(latest.parsed || {});
        setFilename?.(latest.filename);
        setLocalFilename(latest.filename);
        setWarning("Aucun CV téléversé. Utilisation du dernier CV enregistré.");
        onDataChanged?.();
      } catch (e) {
        setError(
          e?.message
            ? `Impossible de récupérer le dernier CV en base: ${e.message}`
            : "Impossible de récupérer le dernier CV en base."
        );
        return;
      }
    }

    setMatching(true);
    try {
      const res = await fetch(`${API_BASE}/api/match`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ cvText: cvTextToUse, jobText: jobText }),
      });

      if (!res.ok) {
        const t = await res.text();
        try {
          const j = JSON.parse(t);
          throw new Error(j?.error || "Erreur de calcul de compatibilité");
        } catch {
          throw new Error(`Erreur de calcul de compatibilité (HTTP ${res.status})`);
        }
      }

      const data = await res.json();

      setLastResult({
        score: Math.round((data.score || 0) * 100) / 100,
        similarity_level: data.similarity_level || "Calculé",
        sectional_scores: data.sectional_scores || {},
        skill_analysis: data.skill_analysis || {},
        missing_keywords: data.missing_keywords || [],
        suggestions: data.suggestions || [],
        method: data.method || "Similarité embeddings",
        parsed_cv: data.parsed_cv,
        parsed_job: data.parsed_job,
      });

      if (Array.isArray(data.messages) && data.messages.length && window.__chatAppend) {
        data.messages.forEach((m) => window.__chatAppend(m));
      }

      
    } catch (err) {
      const msg = err?.message?.includes("Failed to fetch")
        ? "Impossible de se connecter au serveur. Vérifiez qu'il est démarré sur le port 3001."
        : err.message || "Impossible de calculer le score. Vérifiez les textes et réessayez.";
      setError(msg);
    } finally {
      setMatching(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Titre principal */}
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-bold text-slate-800">
          Téléversement CV et description de poste
        </h1>
        <p className="text-slate-600">
          Téléchargez un CV et saisissez la description du poste pour analyser la compatibilité
        </p>
      </div>

      {/* Section Upload */}
      <div className="card p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Upload CV */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-700">Téléverser CV</h3>

            <div className="relative">
              <input
                ref={inputRef}
                id="cvfile"
                type="file"
                accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={onFile}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="rounded-lg border-2 border-dashed min-h-[202px] mb-1 border-slate-300 p-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/50">
                {/* Affichage conditionnel : fichier sélectionné ou zone de drop */}
                {localFilename ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4">
                    <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
                      <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-slate-700">📄 {localFilename}</p>
                      <p className="text-sm text-slate-500 mt-1">Fichier téléversé avec succès</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="text-blue-600 hover:underline text-sm font-medium"
                    >
                      Changer de fichier
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                      <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-slate-600">Glisser-déposer le fichier ici</p>
                      <p className="text-sm text-slate-500">Limite 200MB par fichier • PDF/TXT/DOCX</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button 
              type="button" 
              onClick={() => inputRef.current?.click()} 
              className="btn btn-outline w-full flex items-center justify-center"
            >
              {localFilename ? "Choisir un autre fichier" : "Parcourir fichiers"}
            </button>

            {loading && <div className="text-center text-sm text-blue-600">📄 Extraction en cours...</div>}
            {parsing && <div className="text-center text-sm text-blue-600">⚙️ Analyse du CV...</div>}
          </div>

          {/* Job Description */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-700">Téléverser description du poste</h3>

            <textarea
              ref={jobRef}
              value={jobText}
              onChange={(e) => setJobText(e.target.value)}
              rows={7}
              placeholder="Collez ici la description du poste..."
              className="w-full resize-none rounded-lg border border-slate-300 p-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={handleParseJob}
              disabled={!jobText?.trim() || loading}
              className="w-full btn btn-outline flex items-center justify-center"
            >
              Analyser l'offre
            </button>
          </div>
        </div>

        {/* Erreurs / warnings */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ❌ {error}
          </div>
        )}
        {warning && !error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            ⚠️ {warning}
          </div>
        )}

        {/* Action */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={computeMatching}
            disabled={loading || parsing || matching || !jobText.trim()}
            className="btn btn-primary btn-lg px-8 disabled:opacity-60"
          >
            {matching ? "Analyse en cours..." : "Analyser la compatibilité"}
          </button>
        </div>
      </div>
    </div>
  );
}