import React, { useState } from 'react';
import { useSecurity } from '../../context/SecurityContext';
import { Shield, KeyRound, Mail, User, X, CheckCircle2, Lock } from 'lucide-react';

export const AuthModal = () => {
  const { isAuthModalOpen, closeAuthModal, authModalMode, login, openAuthModal } = useSecurity();
  const [email, setEmail] = useState('alex.vance@enterprise.io');
  const [name, setName] = useState('Alex Vance');
  const [password, setPassword] = useState('••••••••••••');
  const [useWebAuthn, setUseWebAuthn] = useState(true);

  if (!isAuthModalOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    login(email, authModalMode === 'signup' ? name : 'Alex Vance');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-surface-container border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-8 relative">
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-outline hover:text-on-surface p-1 rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-3">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-headline font-bold text-xl text-on-surface">
            {authModalMode === 'signup' ? 'Create Enterprise Security Profile' : 'Sign in to RE:COVER Console'}
          </h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Zero-Trust Protected Console for Autonomous Incident Response
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authModalMode === 'signup' && (
            <div>
              <label className="block text-xs font-mono text-on-surface-variant mb-1.5">FULL NAME</label>
              <div className="relative">
                <User className="w-4 h-4 text-outline absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                  placeholder="Alex Vance"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-on-surface-variant mb-1.5">ENTERPRISE EMAIL</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-outline absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                placeholder="name@enterprise.io"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-on-surface-variant mb-1.5">PASSWORD / MASTER PASSPHRASE</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-outline absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-xl text-xs text-on-surface focus:outline-none focus:border-primary transition-colors"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {/* WebAuthn / Passkey Checkbox */}
          <div
            onClick={() => setUseWebAuthn(prev => !prev)}
            className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-lowest border border-white/5 cursor-pointer hover:border-primary/30 transition-colors"
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center border ${useWebAuthn ? 'bg-primary border-primary text-on-primary' : 'border-outline'}`}>
              {useWebAuthn && <CheckCircle2 className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1">
              <span className="text-xs font-medium text-on-surface flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-secondary" />
                Hardware FIDO2 / TouchID Passkey Enabled
              </span>
              <p className="text-[10px] text-outline">Enforce biometric zero-phishing challenge</p>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary font-semibold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-[0.99] transition-all"
          >
            {authModalMode === 'signup' ? 'Initialize Workspace' : 'Authenticate & Launch'}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-on-surface-variant">
          {authModalMode === 'signup' ? (
            <p>
              Already have an enterprise account?{' '}
              <button
                onClick={() => openAuthModal('login')}
                className="text-primary hover:underline font-semibold"
              >
                Log In
              </button>
            </p>
          ) : (
            <p>
              Need a new enterprise tenant?{' '}
              <button
                onClick={() => openAuthModal('signup')}
                className="text-primary hover:underline font-semibold"
              >
                Request Deployment
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

