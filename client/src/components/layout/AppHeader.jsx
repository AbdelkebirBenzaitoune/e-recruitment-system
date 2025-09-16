// import React from 'react';
// import { useAuth } from "../../contexts/AuthContext";
// import { useNavigate } from 'react-router-dom';
// import { Bot } from "lucide-react";

// export default function AppHeader() {
//   const { user, setUser, setToken, logout } = useAuth();
//   const navigate = useNavigate();

//   function handleLogout() {
//     logout();
//     navigate("/");
//   }

//   return (
//     <header className="relative z-50 px-3 py-4 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
//       <div className="max-w-full mx-3 flex items-center justify-between px-2">
//         {/* Logo + Titre (espacement réduit) */}
//         <div className="flex items-center">
//           <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-600 rounded-lg flex items-center justify-center">
//             <Bot className="w-6 h-6 text-white" />
//           </div>
//           <h1 className="ml-2 text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
//             Assistant Carrière
//           </h1>
//         </div>

//         {/* Bouton Déconnexion (sans space-x inutile) */}
//         <div className="flex items-center">
//           <button
//             onClick={handleLogout}
//             className="bg-red-500 hover:bg-red-700 text-white px-3 py-2 rounded"
//           >
//             Déconnexion
//           </button>
//         </div>
//       </div>
//     </header>
//   );
// }

import React, { useState } from 'react';
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from 'react-router-dom';
import { Bot, User, X, Camera, Edit2, Save, Mail, Phone, MapPin, FileText } from "lucide-react";
import userApiService from "../../services/userApiService";

// Modal de profil utilisateur
function UserProfileModal({ user, onClose, onUpdateUser }) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    location: user?.location || '',
    bio: user?.bio || '',
    avatar: user?.avatar || null
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleUpdateUser(newProfileData) {
    try {
      // Met à jour l'utilisateur dans le contexte avec toutes les nouvelles données
      const updatedUser = { ...user, ...newProfileData };
      setUser(updatedUser);
      
      // Optionnel: recharger le profil depuis le serveur pour s'assurer de la cohérence
      if (loadFullUserProfile) {
        setTimeout(async () => {
          try {
            await loadFullUserProfile();
          } catch (error) {
            console.error('Erreur rechargement profil:', error);
          }
        }, 1000); // Délai pour laisser l'API se mettre à jour
      }
    } catch (error) {
      console.error('Erreur mise à jour utilisateur:', error);
    }
  }

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      // Appel API pour mettre à jour le profil
      const result = await userApiService.updateUserProfile(profileData);
      
      if (result.success) {
        // Met à jour le contexte utilisateur
        onUpdateUser(profileData);
        setSuccess('Profil mis à jour avec succès !');
        setIsEditing(false);
        
        // Masque le message de succès après 3 secondes
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset aux valeurs originales
    setProfileData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      location: user?.location || '',
      bio: user?.bio || '',
      avatar: user?.avatar || null
    });
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        setError('L\'image ne peut pas dépasser 5MB');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileData(prev => ({ ...prev, avatar: e.target.result }));
        setError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const fullName = `${profileData.firstName} ${profileData.lastName}`.trim() || 'Utilisateur';

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl mx-4"
      >
        {/* Header du modal */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Mon Profil</h2>
              <p className="text-sm text-gray-600 mt-1">{fullName}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => isEditing ? handleCancel() : setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg transition-colors"
                disabled={loading}
              >
                <Edit2 className="w-4 h-4" />
                {isEditing ? 'Annuler' : 'Modifier'}
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages de feedback */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {/* Contenu du profil */}
        <div className="p-6">
          {/* Section photo de profil */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-lg">
                {profileData.avatar ? (
                  <img
                    src={profileData.avatar}
                    alt="Photo de profil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-600">
                    <User className="w-10 h-10 text-white" />
                  </div>
                )}
              </div>
              {isEditing && (
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-white" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {isEditing ? 'Cliquez sur l\'image pour la changer' : ''}
            </p>
          </div>

          {/* Informations du profil */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Prénom
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Votre prénom"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">
                    {profileData.firstName || 'Non renseigné'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Nom
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Votre nom"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">
                    {profileData.lastName || 'Non renseigné'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Email
                </label>
                {isEditing ? (
                  <input
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="votre@email.com"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">
                    {profileData.email || 'Non renseigné'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Téléphone
                </label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+33 1 23 45 67 89"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">
                    {profileData.phone || 'Non renseigné'}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <MapPin className="w-4 h-4 inline mr-1" />
                  Localisation
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.location}
                    onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Paris, France"
                  />
                ) : (
                  <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800">
                    {profileData.location || 'Non renseigné'}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <FileText className="w-4 h-4 inline mr-1" />
                À propos de moi
              </label>
              {isEditing ? (
                <textarea
                  value={profileData.bio}
                  onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Décrivez-vous en quelques mots : vos compétences, vos objectifs professionnels..."
                />
              ) : (
                <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-800 min-h-[100px] whitespace-pre-wrap">
                  {profileData.bio || 'Aucune description disponible'}
                </p>
              )}
            </div>
          </div>

          {/* Boutons d'action */}
          {isEditing && (
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={loading}
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
              >
                <Save className="w-4 h-4" />
                {loading ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppHeader() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [showProfileModal, setShowProfileModal] = useState(false);

  function handleLogout() {
    logout();
    navigate("/");
  }

  async function handleUpdateUser(newProfileData) {
    // Met à jour l'utilisateur dans le contexte
    const updatedUser = { ...user, ...newProfileData };
    setUser(updatedUser);
  }

  const displayName = user ? 
    `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Mon profil' 
    : 'Mon profil';

  return (
    <>
      <header className="relative z-50 px-3 py-4 bg-gray-900/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-full mx-3 flex items-center justify-between px-2">
          {/* Logo + Titre */}
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="ml-2 text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Assistant Carrière
            </h1>
          </div>

          {/* Actions utilisateur */}
          <div className="flex items-center gap-3">
            {/* Bouton profil utilisateur */}
            <button
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors group"
              title="Mon profil"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt="Photo de profil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-medium">
                  {displayName}
                </span>
                {user?.email && (
                  <span className="text-xs text-gray-400 truncate max-w-[150px]">
                    {user.email}
                  </span>
                )}
              </div>
            </button>

            {/* Bouton Déconnexion */}
            <button
              onClick={handleLogout}
             className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg transition-colors"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Modal de profil */}
      {showProfileModal && (
        <UserProfileModal
          user={user}
          onClose={() => setShowProfileModal(false)}
          onUpdateUser={handleUpdateUser}
        />
      )}
    </>
  );
}