// src/hooks/useUserData.js
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import userApiService from '../services/userApiService';

export const useUserData = () => {
  const { user, isAuthenticated } = useAuth();
  const [userProfile, setUserProfile] = useState(null);
  const [cvParsings, setCvParsings] = useState([]);
  const [jobMatchings, setJobMatchings] = useState([]);
  const [quizResults, setQuizResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ===== CHARGEMENT INITIAL DES DONNÉES =====
  const loadUserData = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Chargement parallèle de toutes les données utilisateur
      const [profile, cvHistory, jobMatches, quizData] = await Promise.all([
        userApiService.getUserProfile(),
        userApiService.getCVParsings(),
        userApiService.getJobMatchings(),
        userApiService.getQuizResults()
      ]);

      setUserProfile(profile);
      setCvParsings(cvHistory);
      setJobMatchings(jobMatches);
      setQuizResults(quizData);
    } catch (error) {
      setError(error.message);
      console.error('Erreur lors du chargement des données:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Chargement automatique des données quand l'utilisateur se connecte
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // ===== GESTION DU PROFIL =====
  const updateProfile = async (profileData) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await userApiService.updateUserProfile(profileData);
      
      if (result.success && result.updatedUser) {
        // Met à jour le profil local ET le contexte auth
        setUserProfile(result.updatedUser);
        setUser(result.updatedUser); // Met à jour le contexte global
        
        return { success: true, user: result.updatedUser };
      }
      
      return { success: false, error: 'Mise à jour échouée' };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // ===== CHARGEMENT COMPLET DU PROFIL =====
  const loadFullUserProfile = async () => {
    if (!isAuthenticated) return;
    
    try {
      setLoading(true);
      const fullProfile = await userApiService.getUserProfile();
      setUserProfile(fullProfile);
      setUser(fullProfile); // Synchronise avec le contexte auth
      return { success: true, user: fullProfile };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  // ===== GESTION DU CV =====
  const uploadCV = async (cvFile) => {
    try {
      setLoading(true);
      const parsedCV = await userApiService.uploadAndParseCV(cvFile);
      setCvParsings(prev => [parsedCV, ...prev]);
      return { success: true, data: parsedCV };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const refreshCVHistory = async () => {
    try {
      const cvHistory = await userApiService.getCVParsings();
      setCvParsings(cvHistory);
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
  };

  // ===== GESTION DES JOBS =====
  const searchJobs = async (searchCriteria) => {
    try {
      setLoading(true);
      const jobResults = await userApiService.searchJobs(searchCriteria);
      return { success: true, data: jobResults };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const saveJobMatch = async (matchingData) => {
    try {
      const savedMatch = await userApiService.saveJobMatching(matchingData);
      setJobMatchings(prev => [savedMatch, ...prev]);
      return { success: true, data: savedMatch };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
  };

  const refreshJobMatchings = async () => {
    try {
      const matches = await userApiService.getJobMatchings();
      setJobMatchings(matches);
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
  };

  // ===== GESTION DES QUIZ =====
  const startQuiz = async (quizType) => {
    try {
      setLoading(true);
      const quizSession = await userApiService.startQuiz(quizType);
      return { success: true, data: quizSession };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const submitQuiz = async (quizId, answers) => {
    try {
      setLoading(true);
      const result = await userApiService.submitQuizAnswer(quizId, answers);
      setQuizResults(prev => [result, ...prev]);
      return { success: true, data: result };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  };

  const refreshQuizResults = async () => {
    try {
      const results = await userApiService.getQuizResults();
      setQuizResults(results);
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
  };

  // ===== STATISTIQUES ET DASHBOARD =====
  const getDashboardStats = () => {
    return {
      totalCVs: cvParsings.length,
      totalJobMatches: jobMatchings.length,
      totalQuizzes: quizResults.length,
      lastCVUpload: cvParsings[0]?.parsedAt || null,
      lastJobMatch: jobMatchings[0]?.createdAt || null,
      lastQuiz: quizResults[0]?.completedAt || null,
      profileCompleteness: calculateProfileCompleteness(userProfile)
    };
  };

  const calculateProfileCompleteness = (profile) => {
    if (!profile) return 0;
    
    const fields = ['skills', 'experience', 'education', 'preferences'];
    const completedFields = fields.filter(field => 
      profile[field] && Object.keys(profile[field]).length > 0
    );
    
    return Math.round((completedFields.length / fields.length) * 100);
  };

  // ===== FILTRES ET RECHERCHE =====
  const getFilteredJobMatchings = (filters = {}) => {
    let filtered = [...jobMatchings];
    
    if (filters.minScore) {
      filtered = filtered.filter(match => 
        match.matchingScore?.overall >= filters.minScore
      );
    }
    
    if (filters.location) {
      filtered = filtered.filter(match => 
        match.jobData?.location?.toLowerCase().includes(filters.location.toLowerCase())
      );
    }
    
    if (filters.dateRange) {
      const { start, end } = filters.dateRange;
      filtered = filtered.filter(match => {
        const matchDate = new Date(match.createdAt);
        return matchDate >= start && matchDate <= end;
      });
    }
    
    return filtered;
  };

  const getQuizResultsByType = (quizType) => {
    return quizResults.filter(result => result.quizType === quizType);
  };

  // ===== EXPORT ET SAUVEGARDE =====
  const exportData = async (format = 'json') => {
    try {
      await userApiService.exportUserData(format);
      return { success: true };
    } catch (error) {
      setError(error.message);
      return { success: false, error: error.message };
    }
  };

  // ===== NETTOYAGE DES ERREURS =====
  const clearError = () => {
    setError(null);
  };
  

  // ===== RAFRAÎCHISSEMENT COMPLET =====
  const refreshAllData = async () => {
    return loadUserData();
  };

  return {
    // État des données
    userProfile,
    cvParsings,
    jobMatchings,
    quizResults,
    loading,
    error,
    
    updateProfile,
    loadFullUserProfile,
    
    // Actions sur les CV
    uploadCV,
    refreshCVHistory,
    
    // Actions sur les jobs
    searchJobs,
    saveJobMatch,
    refreshJobMatchings,
    getFilteredJobMatchings,
    
    // Actions sur les quiz
    startQuiz,
    submitQuiz,
    refreshQuizResults,
    getQuizResultsByType,
    
    // Statistiques et dashboard
    getDashboardStats,
    
    // Utilitaires
    exportData,
    clearError,
    refreshAllData,
     
    
    // État calculé
    isDataLoaded: !loading && userProfile !== null
  };
};