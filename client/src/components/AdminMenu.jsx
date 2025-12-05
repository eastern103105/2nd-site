import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    BookOpen, Users, Megaphone, DollarSign,
    Download, UserCog, Menu, X, GraduationCap, School, Database,
    LogOut, LayoutDashboard, Settings, MessageCircle
} from 'lucide-react';

export default function AdminMenu() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isOpen, setIsOpen] = useState(false);


    const menuItems = [
        { path: '/admin/lessons', label: '수업 관리', icon: BookOpen, color: 'bg-indigo-600' },
        { path: '/admin/words', label: '단어 관리', icon: GraduationCap, color: 'bg-emerald-600' },
        { path: '/admin/students', label: '학생 관리', icon: Users, color: 'bg-blue-600' },
        { path: '/admin/classes', label: '반 관리', icon: School, color: 'bg-orange-500' },
        { path: '/admin/announcements', label: '공지 관리', icon: Megaphone, color: 'bg-purple-600' },
        { path: '/admin/dollars', label: '달러 관리', icon: DollarSign, color: 'bg-green-600' },
        { path: '/admin/data', label: '데이터 관리', icon: Database, color: 'bg-slate-600' },
        { path: '/admin/settings', label: '학원 설정', icon: UserCog, color: 'bg-gray-800' },
    ];



    return (
        <div className="bg-white border-b border-gray-200 shadow-sm mb-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-14">
                    <div className="flex items-center">
                        <span className="font-bold text-gray-700 text-lg sm:hidden">관리 메뉴</span>
                    </div>

                    {/* Mobile menu button */}
                    <div className="flex items-center sm:hidden">
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
                        >
                            {isOpen ? (
                                <X className="block h-6 w-6" aria-hidden="true" />
                            ) : (
                                <Menu className="block h-6 w-6" aria-hidden="true" />
                            )}
                        </button>
                    </div>

                    {/* Desktop menu */}
                    <div className="hidden sm:flex sm:flex-wrap sm:gap-2 py-2">
                        {menuItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={`
                                    flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
                                    ${location.pathname === item.path
                                        ? `${item.color} text-white shadow-md`
                                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }
                                `}
                            >
                                <item.icon className={`w-4 h-4 mr-2 ${location.pathname === item.path ? 'text-white' : 'text-gray-500'}`} />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mobile menu */}
            {isOpen && (
                <div className="sm:hidden border-t border-gray-200">
                    <div className="pt-2 pb-3 space-y-1 px-2">
                        {menuItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => {
                                    navigate(item.path);
                                    setIsOpen(false);
                                }}
                                className={`
                                    flex items-center w-full px-3 py-3 rounded-md text-base font-medium
                                    ${location.pathname === item.path
                                        ? `${item.color} text-white`
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                    }
                                `}
                            >
                                <item.icon className={`w-5 h-5 mr-3 ${location.pathname === item.path ? 'text-white' : 'text-gray-500'}`} />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
