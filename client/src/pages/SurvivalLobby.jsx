import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skull, Users, Plus, LogIn, Lock, Zap, BookOpen } from 'lucide-react';
import { supabase } from '../supabase';

export default function SurvivalLobby() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomPassword, setNewRoomPassword] = useState('');
    const [availableBooks, setAvailableBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState('');
    const navigate = useNavigate();

    // Auth info
    const userId = localStorage.getItem('userId');
    const userName = localStorage.getItem('name') || localStorage.getItem('username') || 'Unknown';

    // Fetch available books
    const fetchBooks = async (forceRefresh = false) => {
        const academyId = localStorage.getItem('academyId') || 'academy_default';
        const cacheKey = `books_${academyId}`;
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);
        const ONE_HOUR = 60 * 60 * 1000;

        if (!forceRefresh && cachedData && cacheTime && (Date.now() - parseInt(cacheTime) < ONE_HOUR)) {
            const parsedBooks = JSON.parse(cachedData);
            if (parsedBooks.length > 0) {
                setAvailableBooks(parsedBooks);
                return;
            }
        }

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('books')
                .select('name, total_words')
                .eq('academy_id', academyId);

            if (error) throw error;

            const books = data.map(b => ({
                name: b.name,
                totalWords: b.total_words || 0
            })).filter(b => b.name);

            if (books.length > 0) {
                setAvailableBooks(books);
                localStorage.setItem(cacheKey, JSON.stringify(books));
                localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
            }
        } catch (error) {
            console.error("Error fetching books:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBooks();
    }, []);

    // Fetch and Subscribe to rooms
    useEffect(() => {
        const fetchRooms = async () => {
            const { data, error } = await supabase
                .from('battles')
                .select('*')
                .eq('game_type', 'survival')
                .in('status', ['waiting', 'playing']);

            if (error) {
                console.error("Error fetching survival rooms:", error);
            } else {
                setRooms(data || []);
            }
            setLoading(false);
        };
        fetchRooms();

        const channel = supabase
            .channel('public:battles:survival')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: "game_type=eq.survival" }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setRooms(prev => [...prev, payload.new]);
                } else if (payload.eventType === 'DELETE') {
                    setRooms(prev => prev.filter(room => room.id !== payload.old.id));
                } else if (payload.eventType === 'UPDATE') {
                    if (['waiting', 'playing'].includes(payload.new.status)) {
                        setRooms(prev => prev.map(room => room.id === payload.new.id ? payload.new : room));
                    } else {
                        setRooms(prev => prev.filter(room => room.id !== payload.new.id));
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Cleanup zombie rooms
    useEffect(() => {
        const cleanupZombieRooms = async () => {
            if (!userId) return;
            try {
                const { error } = await supabase
                    .from('battles')
                    .delete()
                    .eq('host_id', userId)
                    .eq('game_type', 'survival');
                if (error) console.error("Error cleaning up:", error);
            } catch (error) {
                console.error("Error cleaning up zombie rooms:", error);
            }
        };
        cleanupZombieRooms();
    }, [userId]);


    const handleCreateRoom = async (e) => {
        e.preventDefault();
        if (!newRoomName.trim()) return;

        try {
            const roomData = {
                name: newRoomName,
                password: newRoomPassword,
                game_type: 'survival',
                selected_book: selectedBook,
                host_id: userId,
                host_name: userName,
                status: 'waiting',
                players: {
                    [userId]: {
                        id: userId,
                        name: userName,
                        hp: 100,
                        alive: true,
                        score: 0,
                        gauge: 0,
                        effect: null,
                        ready: true
                    }
                },
                player_count: 1,
                max_players: 10
            };

            const { data, error } = await supabase
                .from('battles')
                .insert(roomData)
                .select()
                .single();

            if (error) throw error;

            setShowCreateModal(false);
            navigate(`/student/survival/${data.id}`);
        } catch (error) {
            console.error("Error creating room:", error);
            alert("방 생성 중 오류가 발생했습니다.");
        }
    };

    const handleJoinRoom = async (room) => {
        if (room.password) {
            const password = prompt("비밀번호를 입력하세요:");
            if (password === null) return;

            if (room.password !== password) {
                alert("비밀번호가 틀렸습니다.");
                return;
            }
        }

        try {
            if (room.player_count >= room.max_players) {
                alert("방이 가득 찼습니다.");
                return;
            }

            const updatedPlayers = {
                ...room.players,
                [userId]: {
                    id: userId,
                    name: userName,
                    hp: 100,
                    alive: true,
                    score: 0,
                    gauge: 0,
                    effect: null,
                    ready: false
                }
            };

            const { error } = await supabase
                .from('battles')
                .update({
                    players: updatedPlayers,
                    player_count: Object.keys(updatedPlayers).length
                })
                .eq('id', room.id);

            if (error) throw error;

            navigate(`/student/survival/${room.id}`);
        } catch (error) {
            console.error("Error joining room:", error);
            alert("방 입장 중 오류가 발생했습니다.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 p-4 md:p-8 font-sans text-white">
            <div className="max-w-6xl mx-auto">
                <header className="flex items-center justify-between mb-8">
                    <div className="flex items-center space-x-3">
                        <div className="bg-red-600 p-3 rounded-xl shadow-lg shadow-red-500/20">
                            <Skull className="w-8 h-8 text-white animate-pulse" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white">단어 서바이벌</h1>
                            <p className="text-gray-400">최후의 1인이 될 때까지 살아남으세요! (최대 10인)</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/40 flex items-center transform hover:scale-105"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        방 만들기
                    </button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        <div className="col-span-full text-center py-12 text-gray-500">
                            로딩 중...
                        </div>
                    ) : rooms.length === 0 ? (
                        <div className="col-span-full text-center py-20 bg-gray-800/50 rounded-3xl border border-gray-700 border-dashed">
                            <Skull className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                            <p className="text-gray-400 text-xl font-bold">현재 진행 중인 서바이벌이 없습니다.</p>
                            <p className="text-gray-500 mt-2">새로운 전장을 열어보세요!</p>
                        </div>
                    ) : (
                        rooms.map(room => (
                            <div key={room.id} className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 hover:border-red-500/50 transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Skull className="w-24 h-24 text-red-500" />
                                </div>

                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div>
                                        <h3 className="text-xl font-bold text-white flex items-center mb-1">
                                            {room.name}
                                            {room.password && <Lock className="w-4 h-4 ml-2 text-gray-400" />}
                                        </h3>
                                        <p className="text-sm text-gray-400">호스트: {room.host_name}</p>
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${room.status === 'playing' ? 'bg-red-500/20 text-red-400' :
                                        room.player_count >= room.max_players ? 'bg-gray-700 text-gray-400' : 'bg-green-500/20 text-green-400'
                                        }`}>
                                        {room.status === 'playing' ? '진행 중' : `${room.player_count}/${room.max_players}`}
                                    </span>
                                </div>

                                <div className="mb-6 relative z-10">
                                    <div className="flex items-center text-sm text-gray-400 mb-2">
                                        <BookOpen className="w-4 h-4 mr-2 text-green-400" />
                                        <span>{room.selected_book || '전체 단어 (랜덤)'}</span>
                                    </div>
                                    <div className="flex items-center text-sm text-gray-400">
                                        <Users className="w-4 h-4 mr-2 text-blue-400" />
                                        <span>최대 10명 입장 가능</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleJoinRoom(room)}
                                    disabled={room.player_count >= room.max_players || room.status === 'playing'}
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center transition-all relative z-10 ${room.player_count >= room.max_players || room.status === 'playing'
                                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                                        }`}
                                >
                                    {room.status === 'playing' ? '이미 시작됨' :
                                        room.player_count >= room.max_players ? '만원' :
                                            <>
                                                <LogIn className="w-5 h-5 mr-2" />
                                                참가하기
                                            </>}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Create Room Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl border border-gray-700 animate-scale-in">
                        <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                            <Plus className="w-6 h-6 mr-2 text-red-500" />
                            방 만들기
                        </h2>
                        <form onSubmit={handleCreateRoom} className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-1">방 제목</label>
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-white placeholder-gray-600"
                                    placeholder="예: 단어 고수만 들어오세요"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-1">단어장 선택</label>
                                <div className="flex space-x-2">
                                    <select
                                        value={selectedBook}
                                        onChange={(e) => setSelectedBook(e.target.value)}
                                        className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-white"
                                    >
                                        <option value="">전체 단어 (랜덤)</option>
                                        {availableBooks.map((book, index) => (
                                            <option key={index} value={book.name}>
                                                {book.name} ({book.totalWords}단어)
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => fetchBooks(true)}
                                        className="px-3 py-3 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600 transition-colors"
                                        title="단어장 목록 새로고침"
                                    >
                                        <Zap className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-1">비밀번호 (선택)</label>
                                <input
                                    type="password"
                                    value={newRoomPassword}
                                    onChange={(e) => setNewRoomPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-white placeholder-gray-600"
                                    placeholder="비워두면 공개방"
                                />
                            </div>
                            <div className="flex space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-3 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600 transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-500 transition-colors shadow-lg shadow-red-600/30"
                                >
                                    만들기
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
