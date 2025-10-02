// src/pages/DemoPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bot, Play, Pause, Volume2, VolumeX, Maximize, 
  CheckCircle, Brain, MessageCircle, Target,
  ChevronRight, Star, Zap, Users, Clock, Shield
} from 'lucide-react';

const DemoPage = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoRef, setVideoRef] = useState(null);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  // Fonctions de contrôle vidéo
  const togglePlay = () => {
    if (videoRef) {
      if (isPlaying) {
        videoRef.pause();
      } else {
        videoRef.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef) {
      videoRef.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef) {
      setCurrentTime(videoRef.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef) {
      setDuration(videoRef.duration);
    }
  };

  const handleSeek = (e) => {
    if (videoRef) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      videoRef.currentTime = pos * duration;
      setCurrentTime(videoRef.currentTime);
    }
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const features = [
    {
      icon: <Target className="w-8 h-8 text-blue-400" />,
      title: "Analyse CV ↔ Emploi",
      description: "Score de compatibilité instantané avec recommandations personnalisées",
      timestamp: "0:15"
    },
    {
      icon: <Brain className="w-8 h-8 text-purple-400" />,
      title: "Quiz Automatisés",
      description: "Génération intelligente de quiz adaptés au poste visé",
      timestamp: "1:30"
    },
    {
      icon: <MessageCircle className="w-8 h-8 text-green-400" />,
      title: "Assistant IA",
      description: "Conseils personnalisés et recommandations de formation",
      timestamp: "2:45"
    },
    {
      icon: <Users className="w-8 h-8 text-orange-400" />,
      title: "Interface Recruteur",
      description: "Dashboard complet pour la gestion des candidats",
      timestamp: "4:00"
    }
  ];

  const benefits = [
    {
      icon: <Clock className="w-6 h-6 text-blue-400" />,
      title: "75% de gain de temps",
      description: "Automatisation du processus de présélection"
    },
    {
      icon: <Shield className="w-6 h-6 text-green-400" />,
      title: "Élimination des biais",
      description: "Évaluation objective basée sur les compétences"
    },
    {
      icon: <Zap className="w-6 h-6 text-purple-400" />,
      title: "IA de pointe",
      description: "Technologie NLP avancée pour l'analyse sémantique"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-blue-900/20 to-purple-900/20">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        
        <div className={`relative z-10 max-w-6xl mx-auto px-6 text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-purple-600 rounded-2xl flex items-center justify-center mr-4">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Assistant Carrière
            </h1>
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Découvrez Assistant Carrière
            </span>
            <br />
            <span className="text-white">en action !</span>
          </h2>
          
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed">
            Regardez notre vidéo démonstrative pour comprendre comment notre IA révolutionne 
            le processus de recrutement et de développement de carrière.
          </p>
        </div>
      </section>

      {/* Video Section */}
      <section className="py-16 bg-gray-800/50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="relative bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
            {/* Video Player */}
            <div className="relative aspect-video bg-black">
              {/* Placeholder pour la vidéo - Remplacez par votre vidéo réelle */}
              
                    <video 
                    ref={setVideoRef}
                    className="w-full h-full object-cover"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    poster="../images/interface.png"
                    >
                    <source src="../videos/VedioDemo.mp4" type="video/mp4" />
                    <source src="/path/to/your-demo-video.webm" type="video/webm" />
                    Votre navigateur ne supporte pas la lecture vidéo.
                    </video>
              
              
            </div>

            {/* Custom Video Controls */}
            <div className="bg-gray-800 p-4">
              <div className="flex items-center space-x-4">
                <button 
                  onClick={togglePlay}
                  className="w-10 h-10 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>
                
                <button 
                  onClick={toggleMute}
                  className="w-8 h-8 text-gray-300 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>

                <div className="flex-1">
                  <div 
                    className="w-full h-2 bg-gray-600 rounded-full cursor-pointer"
                    onClick={handleSeek}
                  >
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all"
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                    ></div>
                  </div>
                </div>

                <span className="text-sm text-gray-300 min-w-max">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <button className="w-8 h-8 text-gray-300 hover:text-white transition-colors">
                  <Maximize className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Video Description */}
          <div className="text-center mt-8">
            <h3 className="text-2xl font-semibold mb-4">
              Démo complète - 4 minutes
            </h3>
            <p className="text-gray-300 max-w-3xl mx-auto">
              Cette vidéo vous présente l'ensemble des fonctionnalités de Assistant Carrière : 
              de l'analyse de CV à la génération de quiz personnalisés, en passant par 
              l'assistant IA et l'interface recruteur.
            </p>
          </div>
        </div>
      </section>

      

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h3 className="text-3xl md:text-4xl font-bold mb-6">
            Prêt à Révolutionner Votre Recrutement ?
          </h3>
          <p className="text-xl text-gray-300 mb-8">
            Rejoignez les centaines d'entreprises et candidats qui utilisent déjà Assistant Carrière 
            pour des recrutements plus efficaces et équitables.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
            <button 
              onClick={() => navigate('/register')}
              className="px-10 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl font-semibold text-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-2xl flex items-center space-x-2"
            >
              <span>Commencer Gratuitement</span>
              <ChevronRight className="w-5 h-5" />
            </button>
            
            <button 
              onClick={() => navigate('/')}
              className="px-8 py-4 border border-gray-600 rounded-xl font-semibold text-lg hover:border-gray-400 hover:bg-gray-800/50 transition-all duration-200"
            >
              Retour à l'accueil
            </button>
          </div>

          <div className="mt-8 text-sm text-gray-400">
            Essai gratuit • Sans engagement • Support inclus
          </div>
        </div>
      </section>
    </div>
  );
};

export default DemoPage;