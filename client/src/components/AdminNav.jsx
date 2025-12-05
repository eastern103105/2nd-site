import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, BookOpen, UserCog, LogOut } from 'lucide-react';

export default function AdminNav() {
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    const navItems = [
        { path: '/admin', icon: Home, label: '대시보드' },
        { path: '/admin/words', icon: BookOpen, label: '단어 관리' },
        { path: '/admin/students', icon: UserCog, label: '학생 관리' },
    ];

    return (
        <nav className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-8">
                        <h1 className="text-xl font-bold text-indigo-600">단어 학습장</h1>
                        <div className="flex space-x-1">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.path;
                                return (
                                    <button
                                        key={item.path}
                                        onClick={() => navigate(item.path)}
                                        className={`flex items-center px-4 py-2 rounded-lg transition-colors ${isActive
                                                ? 'bg-indigo-50 text-indigo-700 font-medium'
                                                : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4 mr-2" />
                                        <span className="text-sm">{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        <span className="text-sm">로그아웃</span>
                    </button>
                </div>
            </div>
        </nav>
    );
}
