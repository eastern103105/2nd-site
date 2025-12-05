import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, User, ChevronLeft } from 'lucide-react';
import { supabase } from '../supabase';
import { cacheManager, CACHE_DURATION, createCacheKey } from '../utils/cache';

export default function Messenger() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeChat, setActiveChat] = useState(null); // Chat ID
    const [chats, setChats] = useState([]);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [totalUnread, setTotalUnread] = useState(0);

    // For Students
    const [teachers, setTeachers] = useState([]);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'chat'

    // Temporary state to hold chat details when opening via event (before it appears in list)
    const [tempChatData, setTempChatData] = useState(null);

    const userId = localStorage.getItem('userId');
    const userRole = localStorage.getItem('role');
    const userName = localStorage.getItem('name') || 'User';

    // Helper to check if user is admin or super_admin
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    // Use state for academyId to ensure it updates after fetch
    const [academyId, setAcademyId] = useState(localStorage.getItem('academyId'));

    const messagesEndRef = useRef(null);

    // Listen for custom event to open chat
    useEffect(() => {
        const handleOpenChatEvent = (event) => {
            const { chatId, recipientId, recipientName } = event.detail;
            if (chatId) {
                setIsOpen(true);
                setActiveChat(chatId);
                setViewMode('chat');

                // Store temp data for immediate display
                if (recipientId && recipientName) {
                    setTempChatData({
                        id: chatId,
                        recipientId,
                        recipientName
                    });
                }
            }
        };

        window.addEventListener('open-chat', handleOpenChatEvent);
        return () => window.removeEventListener('open-chat', handleOpenChatEvent);
    }, []);

    // Fetch AcademyId if missing and subscribe to profile changes ideally, but concise here
    useEffect(() => {
        const fetchAcademyId = async () => {
            if (!userId) return;
            // Simplified fetch/cache from users table
            const { data } = await supabase.from('users').select('academy_id').eq('id', userId).single();
            if (data?.academy_id) {
                setAcademyId(data.academy_id);
                localStorage.setItem('academyId', data.academy_id);
            }
        };
        fetchAcademyId();
    }, [userId]);

    // Fetch Teachers (for Students)
    useEffect(() => {
        if (!isAdmin && isOpen) {
            const fetchTeachers = async () => {
                try {
                    const currentAcademyId = academyId || 'academy_default';
                    // Check Cache
                    const cacheKey = createCacheKey('teachers', currentAcademyId);
                    const cached = cacheManager.get(cacheKey);

                    if (cached) {
                        setTeachers(cached);
                        return;
                    }

                    // Fetch
                    const { data, error } = await supabase
                        .from('users')
                        .select('id, name, role, academy_id')
                        .eq('academy_id', currentAcademyId)
                        .eq('role', 'admin'); // Assuming 'admin' role means teacher

                    if (error) throw error;

                    cacheManager.set(cacheKey, data, CACHE_DURATION.TEACHERS);
                    setTeachers(data || []);
                } catch (error) {
                    console.error("Error fetching teachers:", error);
                }
            };
            fetchTeachers();
        }
    }, [userRole, academyId, isOpen, isAdmin]);

    // Create Chat for Student with specific teacher
    const createStudentChat = async (teacher) => {
        try {
            // Check existing first (redundant safe check)
            /* 
            const { data: existing } = await supabase.from('chats').select('*')
                 .eq('student_id', userId).eq('teacher_id', teacher.id).single();
            if (existing) return existing; 
            */

            const newChatData = {
                student_id: userId,
                student_name: userName,
                teacher_id: teacher.id,
                teacher_name: teacher.name,
                academy_id: academyId,
                last_message: '대화를 시작해보세요!',
                unread_count: { [teacher.id]: 1, [userId]: 0 }
            };

            const { data, error } = await supabase.from('chats').insert(newChatData).select().single();
            if (error) throw error;
            return data;
        } catch (error) {
            console.error("Error creating chat:", error);
            return null;
        }
    };

    // Fetch Chats List & Subscribe
    useEffect(() => {
        if (!userId) return;

        const fetchChats = async () => {
            let query = supabase.from('chats').select('*');
            if (isAdmin) {
                query = query.eq('teacher_id', userId);
            } else {
                query = query.eq('student_id', userId);
            }
            query = query.order('updated_at', { ascending: false });

            const { data } = await query;
            if (data) {
                setChats(data);
                calculateUnread(data);
            }
        };

        fetchChats();

        // Subscribe to changes in chats table
        const channel = supabase
            .channel(`chats_${userId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'chats',
                filter: isAdmin ? `teacher_id=eq.${userId}` : `student_id=eq.${userId}`
            }, (payload) => {
                fetchChats(); // Refresh list on any change
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, userRole, isAdmin]);

    const calculateUnread = (chatList) => {
        let unread = 0;
        chatList.forEach(chat => {
            const countObj = chat.unread_count || {};
            unread += (countObj[userId] || 0);
        });
        setTotalUnread(unread);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const markAsRead = useCallback(async (chatId) => {
        if (!chatId) return;
        // Optimization: Check if we actually have unread
        const chat = chats.find(c => c.id === chatId);
        if (chat && (chat.unread_count?.[userId] || 0) > 0) {
            const newCounts = { ...chat.unread_count, [userId]: 0 };
            await supabase.from('chats').update({ unread_count: newCounts }).eq('id', chatId);
        }
    }, [userId, chats]);

    // Fetch Messages & Subscribe
    useEffect(() => {
        if (!activeChat) return;

        const fetchMessages = async () => {
            const { data } = await supabase
                .from('messages')
                .select('*')
                .eq('chat_id', activeChat)
                .order('created_at', { ascending: true })
                .limit(50);

            if (data) {
                setMessages(data);
                scrollToBottom();
                markAsRead(activeChat); // Read on load
            }
        };

        fetchMessages();

        const channel = supabase
            .channel(`messages_${activeChat}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${activeChat}`
            }, (payload) => {
                setMessages(prev => [...prev, payload.new]);
                scrollToBottom();
                markAsRead(activeChat); // Read on new message if active
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [activeChat, markAsRead]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeChat) return;

        const text = newMessage;
        setNewMessage('');

        try {
            // Find Recipient
            const currentChat = chats.find(c => c.id === activeChat);
            let recipientId;
            let currentCounts = {};

            if (currentChat) {
                recipientId = !isAdmin ? currentChat.teacher_id : currentChat.student_id;
                currentCounts = currentChat.unread_count || {};
            } else if (tempChatData && tempChatData.id === activeChat) {
                // Fallback if chat not in list yet (should be rare)
                recipientId = tempChatData.recipientId;
            } else {
                return; // Error
            }

            // Insert Message
            await supabase.from('messages').insert({
                chat_id: activeChat,
                sender_id: userId,
                sender_name: userName,
                text: text
            });

            // Update Chat Metadata (unread count)
            // Note: Postgres trigger handles updated_at and last_message
            // We just need to update unread_count manually or via another trigger.
            // Let's do it manually for simplicity here, relying on client knowledge
            const newCounts = { ...currentCounts };
            newCounts[recipientId] = (newCounts[recipientId] || 0) + 1;

            await supabase.from('chats').update({
                unread_count: newCounts
            }).eq('id', activeChat);

        } catch (err) {
            console.error("Send failed:", err);
            // setMessages(prev => prev.filter(m => m !== tempMsg)); // Rollback if needed
        }
    };

    const openChat = (chatId) => {
        setActiveChat(chatId);
        setViewMode('chat');
        setTempChatData(null);
    };

    const handleSelectTeacher = async (teacher) => {
        // Check local list first
        let existingChat = chats.find(c => c.teacher_id === teacher.id);

        if (!existingChat) {
            // Check DB async just in case
            const { data } = await supabase.from('chats').select('*').eq('student_id', userId).eq('teacher_id', teacher.id).single();
            if (data) existingChat = data;
        }

        if (existingChat) {
            openChat(existingChat.id);
        } else {
            const newChat = await createStudentChat(teacher);
            if (newChat) {
                openChat(newChat.id);
            }
        }
    };

    const handleCloseChat = () => {
        setActiveChat(null);
        setViewMode('list');
        setTempChatData(null);
    };

    const getChatTitle = () => {
        if (!activeChat) return '메신저';
        const chat = chats.find(c => c.id === activeChat);
        if (chat) {
            return isAdmin ? chat.student_name : (chat.teacher_name || '선생님');
        }
        if (tempChatData && tempChatData.id === activeChat) {
            return tempChatData.recipientName;
        }
        return '...';
    };

    if (!userId) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-80 md:w-96 h-[500px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-scale-in origin-bottom-right">
                    {/* Header */}
                    <div className="bg-indigo-600 p-4 flex justify-between items-center text-white shadow-md">
                        <div className="flex items-center">
                            {viewMode === 'chat' && (
                                <button onClick={handleCloseChat} className="mr-2 hover:bg-indigo-500 p-1 rounded-full">
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                            )}
                            <h3 className="font-bold">
                                {viewMode === 'chat' ? getChatTitle() : '메신저'}
                            </h3>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="hover:bg-indigo-500 p-1 rounded-full">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
                        {viewMode === 'list' ? (
                            <div className="space-y-4">
                                {!isAdmin && (
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">대화 목록</h4>
                                        <div className="space-y-2">
                                            {/* 1. Active Chats */}
                                            {chats.map(chat => (
                                                <div
                                                    key={chat.id}
                                                    onClick={() => openChat(chat.id)}
                                                    className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:bg-indigo-50 cursor-pointer transition-colors flex justify-between items-center"
                                                >
                                                    <div className="flex items-center space-x-3">
                                                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                                                            <User className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-800">{chat.teacher_name}</div>
                                                            <div className="text-xs text-gray-500 truncate w-32">
                                                                {chat.last_message}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {((chat.unread_count?.[userId] || 0) > 0) && (
                                                        <div className="w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                                                            {chat.unread_count[userId]}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {/* 2. Available Teachers */}
                                            {teachers
                                                .filter(teacher => !chats.some(c => c.teacher_id === teacher.id))
                                                .map(teacher => (
                                                    <div
                                                        key={teacher.id}
                                                        onClick={() => handleSelectTeacher(teacher)}
                                                        className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:bg-indigo-50 cursor-pointer transition-colors flex justify-between items-center opacity-80 hover:opacity-100"
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
                                                                <User className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-700">{teacher.name}</div>
                                                                <div className="text-xs text-gray-400">
                                                                    대화 시작하기
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}

                                            {chats.length === 0 && teachers.length === 0 && (
                                                <div className="text-center text-gray-400 text-sm py-4">
                                                    대화 가능한 선생님이 없습니다.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {isAdmin && (
                                    <div className="space-y-2">
                                        {chats.map(chat => (
                                            <div
                                                key={chat.id}
                                                onClick={() => openChat(chat.id)}
                                                className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm hover:bg-indigo-50 cursor-pointer transition-colors flex justify-between items-center"
                                            >
                                                <div>
                                                    <div className="font-bold text-gray-800">{chat.student_name}</div>
                                                    <div className="text-sm text-gray-500 truncate w-48">{chat.last_message}</div>
                                                </div>
                                                {((chat.unread_count?.[userId] || 0) > 0) && (
                                                    <div className="w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">
                                                        {chat.unread_count[userId]}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {chats.length === 0 && <div className="text-center text-gray-400 mt-10">대화가 없습니다.</div>}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Messages Area
                            <div className="space-y-4">
                                {messages.map(msg => {
                                    const isMe = msg.sender_id === userId;
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${isMe
                                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                                : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none shadow-sm'
                                                }`}>
                                                {msg.text}
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    {viewMode === 'chat' && activeChat && (
                        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-gray-100 flex space-x-2">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                className="flex-1 px-4 py-2 bg-gray-100 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                placeholder="메시지를 입력하세요..."
                            />
                            <button
                                type="submit"
                                disabled={!newMessage.trim()}
                                className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:bg-gray-300 transition-colors"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all transform hover:scale-110 flex items-center justify-center"
            >
                {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-7 h-7" />}
                {totalUnread > 0 && (
                    <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full border-2 border-white flex items-center justify-center transform translate-x-1 -translate-y-1">
                        {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                )}
            </button>
        </div>
    );
}
