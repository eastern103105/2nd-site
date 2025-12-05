import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { supabase } from '../supabase';
import Messenger from './Messenger';
import AdminMenu from './AdminMenu';

export default function Layout() {
    const navigate = useNavigate();
    const location = useLocation();
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');
    const academyId = localStorage.getItem('academyId');
    const [logoText, setLogoText] = React.useState('Eastern WordTest');

    React.useEffect(() => {
        const fetchSettings = async () => {
            if (academyId) {
                try {
                    // Try cache first? Optional, but Supabase is fast.
                    // Accessing JSONB column 'settings'
                    const { data, error } = await supabase
                        .from('academies')
                        .select('settings')
                        .eq('id', academyId)
                        .single();

                    if (data?.settings?.logoText) {
                        setLogoText(data.settings.logoText);
                    }
                } catch (error) {
                    console.error("Error fetching settings:", error);
                }
            }
        };
        fetchSettings();
    }, [academyId]);

    const handleLogout = () => {
        const currentAcademyId = localStorage.getItem('academyId');
        localStorage.clear();
        if (currentAcademyId) {
            localStorage.setItem('academyId', currentAcademyId);
        }
        navigate('/login');
    };

    const handleGoHome = () => {
        if (role === 'admin' || role === 'super_admin') navigate('/admin');
        else if (role === 'student') navigate('/student');
        else navigate('/login');
    };

    // Don't show layout on login page
    if (location.pathname === '/login') {
        return <Outlet />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex items-center cursor-pointer group" onClick={handleGoHome}>
                            <span className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500 tracking-tight group-hover:from-indigo-500 group-hover:to-blue-400 transition-all whitespace-nowrap">
                                {logoText}
                            </span>
                        </div>
                        <div className="flex items-center space-x-2 sm:space-x-4">
                            <span className="text-gray-600 text-xs sm:text-sm hidden sm:inline">
                                {['admin', 'super_admin'].includes(role) ? '선생님' : '학생'}: <b>{localStorage.getItem('name') || username}</b>
                            </span>
                            <span className="text-gray-600 text-xs sm:hidden font-bold">
                                {localStorage.getItem('name') || username}
                            </span>
                            <button
                                onClick={handleGoHome}
                                className="p-2 text-gray-500 hover:text-indigo-600 transition-colors"
                                title="메인 메뉴"
                            >
                                <Home className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleLogout}
                                className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                                title="로그아웃"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>
            {['admin', 'super_admin'].includes(role) && <AdminMenu />}
            <main>
                <Outlet />
            </main>
            <Messenger />
        </div>
    );
}
