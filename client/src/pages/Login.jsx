import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabase';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSignUp, setIsSignUp] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    // Branding State
    const [branding, setBranding] = useState({
        title: 'Eastern WordTest',
        subtitle: '이스턴 영어 공부방'
    });

    useEffect(() => {
        const fetchBranding = async () => {
            const params = new URLSearchParams(location.search);
            const academyId = params.get('academy') || localStorage.getItem('academyId');

            if (academyId) {
                try {
                    const { data, error } = await supabase
                        .from('academies')
                        .select('settings')
                        .eq('id', academyId)
                        .single();

                    if (data && data.settings) {
                        setBranding({
                            title: data.settings.loginTitle || 'Eastern WordTest',
                            subtitle: data.settings.loginSubtitle || '이스턴 영어 공부방'
                        });
                    }
                } catch (error) {
                    console.error("Error fetching branding:", error);
                }
            }
        };
        fetchBranding();
    }, [location]);

    const getEmail = (id) => {
        return id.includes('@') ? id : `${id}@wordtest.com`;
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const email = getEmail(username);

            if (isSignUp) {
                // Sign Up Logic
                const { data: { user }, error: signUpError } = await supabase.auth.signUp({
                    email: email,
                    password: password,
                });
                if (signUpError) throw signUpError;

                // Create Profile
                const userData = {
                    id: user.id,
                    email: email,
                    username: username,
                    name: username.split('@')[0],
                    role: 'student', // Default role
                    created_at: new Date().toISOString(),
                    academy_id: 'academy_default',
                    status: 'active'
                };

                const { error: dbError } = await supabase.from('users').insert(userData);
                if (dbError) throw dbError;

                alert('회원가입이 완료되었습니다! 이제 로그인해주세요.');
                setIsSignUp(false);
                setLoading(false);
                return;
            }

            // 1. Supabase SignIn
            const { data: { session, user }, error: signInError } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (signInError) throw signInError;

            // 2. Get User Profile
            let { data: userData, error: profileError } = await supabase
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            // Auto-recover / Initial Sync if profile missing but Auth works (unlikely if migration worked, but safe)
            if (!userData) {
                userData = {
                    id: user.id,
                    email: email,
                    username: email, // approximations
                    name: email.split('@')[0],
                    role: 'student',
                    created_at: new Date().toISOString(),
                    academy_id: 'academy_default',
                    status: 'active'
                };
                // Insert into Supabase
                await supabase.from('users').insert(userData);
            }

            // Developer Override
            if (email.includes('stp282')) {
                userData.role = 'super_admin';
                await supabase.from('users').update({ role: 'super_admin' }).eq('id', user.id);
            }

            // Check Suspended
            if (userData.role === 'student' && userData.status === 'suspended') {
                await supabase.auth.signOut();
                setError('휴원 중인 학생은 로그인할 수 없습니다. 관리자에게 문의하세요.');
                setLoading(false);
                return;
            }

            // LocalStorage Compat (Legacy App Support)
            localStorage.setItem('token', session.access_token);
            localStorage.setItem('role', userData.role);
            localStorage.setItem('username', userData.username || userData.email);
            localStorage.setItem('name', userData.name);
            localStorage.setItem('userId', user.id);
            localStorage.setItem('academyId', userData.academy_id || 'academy_default');

            // Routing
            if (userData.role === 'admin') {
                navigate('/admin');
            } else if (userData.role === 'super_admin') {
                navigate('/super-admin');
            } else {
                // Update last_login is not strictly existent in our schema yet, optional.
                navigate('/student');
            }

        } catch (err) {
            console.error(err);
            if (err.message.includes('Invalid login credentials')) {
                setError('아이디 또는 비밀번호가 올바르지 않습니다.');
            } else {
                setError('로그인 중 오류가 발생했습니다: ' + err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
            <div className="w-full max-w-md p-6 sm:p-8 space-y-6 bg-white rounded-2xl shadow-xl">
                <div className="flex flex-col items-center mb-2">
                    <div className="mb-6 text-center transform hover:scale-105 transition-transform duration-300">
                        <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 tracking-tighter mb-2 drop-shadow-sm">
                            {branding.title}
                        </h1>
                        <h2 className="text-lg sm:text-xl font-bold text-gray-600 tracking-wide">
                            {branding.subtitle}
                        </h2>
                    </div>
                    <p className="text-gray-500 text-sm">
                        로그인하여 학습을 시작하세요.
                    </p>
                </div>

                {error && (
                    <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">아이디</label>
                        <input
                            type="text"
                            required
                            placeholder="예: student1"
                            className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">비밀번호</label>
                        <input
                            type="password"
                            required
                            placeholder="비밀번호 입력"
                            className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2 text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition-all font-medium flex justify-center items-center"
                    >
                        {loading ? '처리 중...' : (isSignUp ? '회원가입' : '로그인')}
                    </button>

                    <div className="flex justify-center mt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError('');
                            }}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
