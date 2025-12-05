import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Swords, Plus, LogIn, RefreshCw, Lock } from 'lucide-react';
import { supabase } from '../supabase';

export default function BattleLobby() {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomPassword, setNewRoomPassword] = useState('');
    const [newRoomDifficulty, setNewRoomDifficulty] = useState('normal');
    const [availableBooks, setAvailableBooks] = useState([]);
    const [selectedBook, setSelectedBook] = useState('');
    const navigate = useNavigate();

    // Get user info from localStorage (managed by Login.jsx)
    const userId = localStorage.getItem('userId');
    // For 'name', we should prefer the one in 'user' table if possible, but localStorage is faster for now.
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

    // Fetch initial rooms and Subscribe to Realtime changes
    useEffect(() => {
        const fetchRooms = async () => {
            const { data, error } = await supabase
                .from('battles')
                .select('*')
                .in('status', ['waiting', 'playing'])
                .eq('game_type', 'battle'); // Filter by game type

            if (error) {
                console.error("Error fetching rooms:", error);
            } else {
                setRooms(data || []);
            }
            setLoading(false);
        };

        fetchRooms();

        const channel = supabase
            .channel('public:battles')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: "game_type=eq.battle" }, (payload) => {
                // Simple approach: re-fetch or optimistically update
                // Payload contains new and old.
                // We can handle INSERT, UPDATE, DELETE
                if (payload.eventType === 'INSERT') {
                    setRooms(prev => [...prev, payload.new]);
                } else if (payload.eventType === 'DELETE') {
                    setRooms(prev => prev.filter(room => room.id !== payload.old.id));
                } else if (payload.eventType === 'UPDATE') {
                    // Only update if it's waiting or playing
                    if (['waiting', 'playing'].includes(payload.new.status)) {
                        setRooms(prev => prev.map(room => room.id === payload.new.id ? payload.new : room));
                    } else {
                        // If status changed to finished, remove it
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
                // Delete rooms where host_id is me
                const { error } = await supabase
                    .from('battles')
                    .delete()
                    .eq('host_id', userId);

                if (error) console.error("Error cleaning up rooms:", error);
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
                difficulty: newRoomDifficulty,
                selected_book: selectedBook,
                host_id: userId,
                host_name: userName,
                status: 'waiting',
                players: {
                    [userId]: {
                        id: userId,
                        name: userName,
                        score: 0,
                        passCount: 0,
                        ready: true
                    }
                },
                player_count: 1,
                max_players: 2,
                game_type: 'battle'
            };

            const { data, error } = await supabase
                .from('battles')
                .insert(roomData)
                .select()
                .single();

            if (error) throw error;

            setShowCreateModal(false);
            navigate(`/student/battle/${data.id}`);
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
            // Check if full (Double check)
            if (room.player_count >= room.max_players) {
                alert("방이 가득 찼습니다.");
                return;
            }

            const updatedPlayers = {
                ...room.players,
                [userId]: {
                    id: userId,
                    name: userName,
                    score: 0,
                    passCount: 0,
                    ready: false
                }
            };

            // Optimistic update - this might have race conditions but is okay for small scale
            const { error } = await supabase
                .from('battles')
                .update({
                    players: updatedPlayers,
                    player_count: Object.keys(updatedPlayers).length
                })
                .eq('id', room.id);

            if (error) throw error;

            navigate(`/student/battle/${room.id}`);
        } catch (error) {
            console.error("Error joining room:", error);
            alert("방 입장 중 오류가 발생했습니다. 이미 가득 찼거나 삭제된 방일 수 있습니다.");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
            <div className="max-w-4xl mx-auto">
                <header className="flex items-center justify-between mb-8">
                    <div className="flex items-center space-x-3">
                        <div className="bg-indigo-600 p-3 rounded-xl shadow-lg">
                            <Swords className="w-8 h-8 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">배틀 아레나</h1>
                            <p className="text-gray-500">다른 학생들과 실시간으로 단어 실력을 겨루세요!</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md flex items-center transform hover:scale-105"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        방 만들기
                    </button>
                </header>

                {/* Room List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {loading ? (
                        <div className="col-span-2 text-center py-12 text-gray-500">
                            로딩 중...
                        </div>
                    ) : rooms.length === 0 ? (
                        <div className="col-span-2 text-center py-12 bg-white rounded-2xl border border-gray-200 border-dashed">
                            <Swords className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 text-lg">현재 대기 중인 방이 없습니다.</p>
                            <p className="text-gray-400 text-sm">새로운 방을 만들어보세요!</p>
                        </div>
                    ) : (
                        rooms.map(room => (
                            <div key={room.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-800 flex items-center">
                                            {room.name}
                                            {room.password && <Lock className="w-4 h-4 ml-2 text-gray-400" />}
                                        </h3>
                                        <p className="text-sm text-gray-500">호스트: {room.host_name}</p>
                                    </div>
                                    <div className="flex flex-col items-end space-y-2">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${room.status === 'playing' ? 'bg-red-100 text-red-600' :
                                            room.player_count >= room.max_players ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-600'
                                            }`}>
                                            {room.status === 'playing' ? '게임 중' : `${room.player_count || 0}/${room.max_players}`}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${room.difficulty === 'hard' ? 'bg-red-50 text-red-600 border-red-200' :
                                            room.difficulty === 'easy' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                                'bg-yellow-50 text-yellow-600 border-yellow-200'
                                            }`}>
                                            {room.difficulty === 'hard' ? '어려움' : room.difficulty === 'easy' ? '쉬움' : '보통'}
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleJoinRoom(room)}
                                    disabled={room.player_count >= room.max_players || room.status === 'playing'}
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center transition-colors ${room.player_count >= room.max_players || room.status === 'playing'
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                        }`}
                                >
                                    {room.status === 'playing' ? '게임 진행 중' :
                                        room.player_count >= room.max_players ? '만원' :
                                            <>
                                                <LogIn className="w-5 h-5 mr-2" />
                                                입장하기
                                            </>}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Create Room Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
                        <h2 className="text-2xl font-bold text-gray-900 mb-6">방 만들기</h2>
                        <form onSubmit={handleCreateRoom} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">방 제목</label>
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="예: 초등 영단어 한판 붙자!"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">난이도</label>
                                <select
                                    value={newRoomDifficulty}
                                    onChange={(e) => setNewRoomDifficulty(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                    <option value="easy">쉬움 (초성 힌트)</option>
                                    <option value="normal">보통</option>
                                    <option value="hard">어려움 (시간 제한)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">단어장 선택</label>
                                <div className="flex space-x-2">
                                    <select
                                        value={selectedBook}
                                        onChange={(e) => setSelectedBook(e.target.value)}
                                        className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
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
                                        className="px-3 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                                        title="단어장 목록 새로고침"
                                    >
                                        <RefreshCw className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">비밀번호 (선택)</label>
                                <input
                                    type="password"
                                    value={newRoomPassword}
                                    onChange={(e) => setNewRoomPassword(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="비워두면 공개방"
                                />
                            </div>
                            <div className="flex space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
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
