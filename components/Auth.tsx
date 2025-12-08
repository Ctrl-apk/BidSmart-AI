
import React, { useState } from 'react';
import { User } from '../types';
import { Lock, Mail, User as UserIcon, ArrowRight, Loader2, Sparkles } from 'lucide-react';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate API network delay
    await new Promise(resolve => setTimeout(resolve, 1200));

    if (!formData.email || !formData.password) {
        setError("Please fill in all fields");
        setLoading(false);
        return;
    }

    if (!isLogin && !formData.name) {
        setError("Please enter your name");
        setLoading(false);
        return;
    }

    // Mock authentication success
    const user: User = {
        name: isLogin ? (formData.email.split('@')[0] || 'User') : formData.name,
        email: formData.email,
        role: 'Proposal Manager'
    };

    onLogin(user);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full flex flex-col md:flex-row min-h-[500px]">
        
        {/* Left Side: Brand & Visuals */}
        <div className="bg-blue-600 text-white p-12 md:w-5/12 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10">
                <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
                </svg>
            </div>
            
            <div className="relative z-10">
                <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm mb-6">
                    <Sparkles className="text-white" size={24} />
                </div>
                <h1 className="text-3xl font-bold mb-2">BidSmart AI</h1>
                <p className="text-blue-100 opacity-90">Autonomous Agentic RFP Response System</p>
            </div>

            <div className="relative z-10 space-y-4">
                <div className="bg-blue-700/50 p-4 rounded-lg backdrop-blur-sm border border-blue-500/30">
                    <p className="text-sm italic">"Accelerate your tender response time by 10x with multi-agent orchestration."</p>
                </div>
            </div>
        </div>

        {/* Right Side: Form */}
        <div className="p-12 md:w-7/12 bg-white flex flex-col justify-center">
            <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-800">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <p className="text-slate-500 mt-1">
                    {isLogin ? 'Enter your credentials to access your workstation.' : 'Get started with your AI proposal assistant.'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
                {!isLogin && (
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-slate-400">Full Name</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input 
                                type="text"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                placeholder="John Doe"
                            />
                        </div>
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input 
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({...formData, email: e.target.value})}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="name@company.com"
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-400">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                        <input 
                            type="password"
                            value={formData.password}
                            onChange={e => setFormData({...formData, password: e.target.value})}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                {error && (
                    <div className="text-red-500 text-sm bg-red-50 p-2 rounded flex items-center gap-2">
                        <AlertCircle size={14} /> {error}
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : (
                        <>
                            {isLogin ? 'Sign In' : 'Create Account'} 
                            <ArrowRight size={18} />
                        </>
                    )}
                </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <p className="text-sm text-slate-500">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button 
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError('');
                        }}
                        className="ml-2 text-blue-600 font-bold hover:underline"
                    >
                        {isLogin ? 'Sign Up' : 'Log In'}
                    </button>
                </p>
            </div>
        </div>
      </div>
      
      {/* Footer / Copyright */}
      <div className="fixed bottom-4 text-slate-500 text-xs opacity-50">
        &copy; 2024 BidSmart AI. Enterprise Grade Security.
      </div>
    </div>
  );
};

// Helper icon for error state
function AlertCircle({ size }: { size: number }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
    );
}

export default Auth;
