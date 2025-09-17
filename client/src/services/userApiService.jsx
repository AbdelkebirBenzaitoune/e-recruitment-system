// src/services/userApiService.js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class UserApiService {
  constructor() {
    this.baseURL = API_URL;
  }

  async getAssistantCards() {
    const res = await fetch(`${this.baseURL}/api/assistant/cards`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(res);
  }
  

  // Récupération du profil complet (nouvelle méthode)
  getUserProfile = async () => {
    try {
      const response = await fetch(`${this.baseURL}/api/user/profile`, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });
      const result = await this.handleResponse(response);
      return result.user || result;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération du profil: ${error.message}`);
    }
  };

  // Mise à jour du profil (méthode corrigée)
  updateUserProfile = async (profileData) => {
    try {
      const response = await fetch(`${this.baseURL}/api/user/profile`, {
        method: 'PUT',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(profileData)
      });
      const result = await this.handleResponse(response);
      
      return {
        success: result.success,
        message: result.message,
        updatedUser: result.user // Le backend retourne l'utilisateur mis à jour
      };
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour du profil: ${error.message}`);
    }
  };




  // === Auth ===
  async register(data) {
    const res = await fetch(`${this.baseURL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  async login(data) {
    const res = await fetch(`${this.baseURL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  async getMe() {
    try {
      // Utilise la nouvelle route profil qui est plus complète
      return await this.getUserProfile();
    } catch (error) {
      // Fallback sur l'ancienne route si elle existe encore
      const res = await fetch(`${this.baseURL}/api/auth/me`, {
        headers: this.getAuthHeaders(),
      });
      return this.handleResponse(res);
    }
  }

  // === CV & Jobs ===
  async parseCV(cvText) {
    const res = await fetch(`${this.baseURL}/api/parse-cv`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ cvText }),
    });
    return this.handleResponse(res);
  }

  async parseJob(jobText) {
    const res = await fetch(`${this.baseURL}/api/parse-job`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ jobText }),
    });
    return this.handleResponse(res);
  }

  async match(data) {
    const res = await fetch(`${this.baseURL}/api/match`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return this.handleResponse(res);
  }

  // === Quiz ===
  async startQuiz(level) {
    const res = await fetch(`${this.baseURL}/api/quiz`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ level }),
    });
    return this.handleResponse(res);
  }

  async evaluate(answers) {
    const res = await fetch(`${this.baseURL}/api/quiz/evaluate`, {
      method: "POST",
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ answers }),
    });
    return this.handleResponse(res);
  }

  async getResults(type = null) {
    let url = `${this.baseURL}/api/results`;
    if (type) {
      url += `?type=${type}`;
    }
    const res = await fetch(url, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(res);
  }

  // === Users ===
  async getUsers() {
    const res = await fetch(`${this.baseURL}/api/users`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(res);
  }

  async getUserById(id) {
    const res = await fetch(`${this.baseURL}/api/users/${id}`, {
      headers: this.getAuthHeaders(),
    });
    return this.handleResponse(res);
  }

 
  
  
  

  // CV Parsing
  uploadAndParseCV = async (cvFile) => {
    try {
      const formData = new FormData();
      formData.append('file', cvFile);

      const token = sessionStorage.getItem('authToken');
      const response = await fetch(`${this.baseURL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const uploadResult = await this.handleResponse(response);
      
      // Parse le CV extrait
      if (uploadResult.success && uploadResult.text) {
        const parseResult = await this.parseCV(uploadResult.text);
        return {
          ...parseResult,
          filename: uploadResult.filename,
          parsedAt: new Date().toISOString()
        };
      }
      
      return uploadResult;
    } catch (error) {
      throw new Error(`Erreur lors du parsing du CV: ${error.message}`);
    }
  };

  getCVParsings = async () => {
    try {
      // Récupère tous les résultats de type "cv"
      return await this.getResults('cv');
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des CV parsés: ${error.message}`);
    }
  };

  // Job Matching
  searchJobs = async (searchCriteria) => {
    try {
      // Cette fonctionnalité n'existe pas encore dans votre backend
      // Retourne des données mockées pour l'instant
      console.warn('searchJobs: Fonctionnalité pas encore implémentée côté backend');
      return {
        success: true,
        jobs: [],
        message: 'Recherche d\'emploi pas encore implémentée'
      };
    } catch (error) {
      throw new Error(`Erreur lors de la recherche d'emplois: ${error.message}`);
    }
  };

  getJobMatchings = async () => {
    try {
      // Récupère tous les résultats de type "matching"
      return await this.getResults('matching');
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des matchings: ${error.message}`);
    }
  };

  saveJobMatching = async (matchingData) => {
    try {
      // Sauvegarde directe via l'API results
      const response = await fetch(`${this.baseURL}/api/results`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          type: 'matching',
          data: matchingData,
          meta: {
            savedAt: new Date().toISOString()
          }
        })
      });
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(`Erreur lors de la sauvegarde du matching: ${error.message}`);
    }
  };


  submitQuizAnswer = async (quizId, answers) => {
    try {
      // Utilise la méthode evaluate existante
      return await this.evaluate(answers);
    } catch (error) {
      throw new Error(`Erreur lors de la soumission des réponses: ${error.message}`);
    }
  };

  getQuizResults = async () => {
    try {
      // Récupère tous les résultats de quiz
      const quizGenerated = await this.getResults('quiz');
      const quizEvaluated = await this.getResults('quiz_evaluation');
      
      // Combine les deux types de résultats
      return [...quizGenerated, ...quizEvaluated];
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des résultats: ${error.message}`);
    }
  };

  // Assistant IA (fonctionnalités futures)
  getChatHistory = async () => {
    try {
      console.warn('getChatHistory: Fonctionnalité pas encore implémentée');
      return [];
    } catch (error) {
      throw new Error(`Erreur lors de la récupération de l'historique: ${error.message}`);
    }
  };

  sendMessageToAssistant = async (message) => {
    try {
      console.warn('sendMessageToAssistant: Fonctionnalité pas encore implémentée');
      return {
        success: true,
        response: 'Assistant IA pas encore disponible',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Erreur lors de l'envoi du message: ${error.message}`);
    }
  };

  // Dashboard
  getDashboardData = async () => {
    try {
      // Récupère tous les résultats pour construire le dashboard
      const allResults = await this.getResults();
      return {
        success: true,
        data: allResults,
        stats: {
          totalResults: allResults.length,
          byType: allResults.reduce((acc, result) => {
            acc[result.type] = (acc[result.type] || 0) + 1;
            return acc;
          }, {})
        }
      };
    } catch (error) {
      throw new Error(`Erreur lors du chargement du dashboard: ${error.message}`);
    }
  };

  // Export
  exportUserData = async (format = 'json') => {
    try {
      const allData = await this.getResults();
      const dataStr = JSON.stringify(allData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-data.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return { success: true };
    } catch (error) {
      throw new Error(`Erreur lors de l'export: ${error.message}`);
    }
  };

  // === Utils ===
  getAuthHeaders = () => {
    const token = sessionStorage.getItem("authToken");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  handleResponse = async (response) => {
    if (!response.ok) {
      let errorMsg = "Une erreur est survenue";
      try {
        const error = await response.json();
        errorMsg = error.error || error.message || errorMsg;
      } catch (_) {}
      throw new Error(errorMsg);
    }
    return response.json();
  };
}

const userApiService = new UserApiService();
export default userApiService;