import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Users, Play, LogOut, Trophy, Zap, CheckCircle, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function BattleRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [room, setRoom] = useState(null);
    const [words, setWords] = useState([]);
    const [currentWord, setCurrentWord] = useState(null);
    const [userInput, setUserInput] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [feedback, setFeedback] = useState(null);
    const [winner, setWinner] = useState(null);

    const userId = localStorage.getItem('userId');
    const inputRef = useRef(null);
    const timerRef = useRef(null);

    const triggerWinConfetti = () => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    const fetchRoom = useCallback(async () => {
        const { data, error } = await supabase
            .from('battles')
            .select('*')
            .eq('id', roomId)
            .single();

        if (error) {
            console.error("Error fetching room:", error);
            // alert('방이 존재하지 않거나 삭제되었습니다.'); // Can cause loops if realtime triggers
            return;
        }
        setRoom(data);
    }, [roomId]);

    // Initial fetch and Subscription
    useEffect(() => {
        fetchRoom();

        const channel = supabase
            .channel(`battle_room_${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: `id=eq.${roomId}` }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    alert('방이 삭제되었습니다.');
                    navigate('/student/battle');
                } else {
                    setRoom(payload.new);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, navigate, fetchRoom]);

    // Handle Game Over Check from Room State
    useEffect(() => {
        if (room?.status === 'finished' && !winner) {
            const players = typeof room.players === 'string' ? JSON.parse(room.players) : room.players;
            const playersArray = Object.values(players || {});
            if (playersArray.length > 0) {
                const sorted = playersArray.sort((a, b) => b.score - a.score);
                const topPlayer = sorted[0];
                setWinner(topPlayer);
                if (topPlayer.id === userId) {
                    triggerWinConfetti();
                }
            }
        }
    }, [room, winner, userId]);

    const endGame = useCallback(async () => {
        await supabase
            .from('battles')
            .update({ status: 'finished' })
            .eq('id', roomId);
    }, [roomId]);

    // Sync current word based on room state
    useEffect(() => {
        if (room?.status === 'playing') {
            // Parse game_words if necessary (Supabase returns JSONB as object automatically usually)
            const gameWords = room.game_words || []; // Assuming camelCase to snake_case migration logic

            if (gameWords.length > 0 && words.length === 0) {
                setWords(gameWords);
            }

            const index = room.current_word_index || 0;
            const currentWordsList = gameWords.length > 0 ? gameWords : words; // Use room words ideally

            if (currentWordsList.length > 0 && index < currentWordsList.length) {
                // Determine if we need to update state
                // Only update if word changed effectively
                if (currentWord?.id !== currentWordsList[index].id) {
                    setCurrentWord(currentWordsList[index]);
                    setUserInput('');
                    setFeedback(null);
                    inputRef.current?.focus();

                    // Difficulty Logic
                    if (room.difficulty === 'hard') {
                        setTimeLeft(10);
                    }
                }
            } else if (room.host_id === userId && currentWordsList.length > 0 && index >= currentWordsList.length) {
                endGame();
            }
        }
    }, [room, words, currentWord, userId, endGame]);

    // Timer for Hard Mode
    useEffect(() => {
        if (room?.difficulty === 'hard' && room?.status === 'playing' && timeLeft > 0 && !feedback) {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current);
                        // Time over - Host triggers next
                        if (room.host_id === userId) {
                            supabase
                                .from('battles')
                                .update({ current_word_index: (room.current_word_index || 0) + 1 })
                                .eq('id', roomId);
                        }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return () => clearInterval(timerRef.current);
        }
    }, [timeLeft, room, feedback, userId, roomId]);

    const handleStartGame = async () => {
        if (room.player_count < 2) {
            alert('최소 2명의 플레이어가 필요합니다.');
            return;
        }

        try {
            let bookName = room?.selected_book || '기본';
            let targetWords = [];
            const academyId = localStorage.getItem('academyId') || 'academy_default'; // Or from room if we stored it

            // Fetch words
            // Simple approach: fetch all words for book, shuffle, pick 10
            // Optimized approach if we had IDs.

            const { data: allWords, error } = await supabase
                .from('words')
                .select('*')
                .eq('book_name', bookName)
                .eq('academy_id', academyId);

            if (error) throw error;

            if (allWords && allWords.length > 0) {
                targetWords = allWords.sort(() => 0.5 - Math.random()).slice(0, 10);
            }

            if (targetWords.length === 0) {
                alert('단어가 부족하여 게임을 시작할 수 없습니다.');
                return;
            }

            const startTime = new Date().toISOString();

            await supabase
                .from('battles')
                .update({
                    status: 'playing',
                    current_word_index: 0,
                    game_words: targetWords,
                    // start_time: startTime // if column exists
                })
                .eq('id', roomId);

        } catch (error) {
            console.error("Error starting game:", error);
            alert("게임을 시작하는 중 오류가 발생했습니다.");
        }
    };

    const handleLeave = async () => {
        if (window.confirm('정말 나가시겠습니까?')) {
            if (room.host_id === userId) {
                await supabase.from('battles').delete().eq('id', roomId);
            } else {
                // Fetch fresh room data to properly modify players
                const { data: latestRoom } = await supabase.from('battles').select('players, player_count').eq('id', roomId).single();
                if (latestRoom) {
                    const players = latestRoom.players || {};
                    delete players[userId];
                    await supabase
                        .from('battles')
                        .update({
                            players: players,
                            player_count: Math.max(0, (latestRoom.player_count || 1) - 1)
                        })
                        .eq('id', roomId);
                }
            }
            navigate('/student/battle');
        }
    };

    const handlePass = async () => {
        if (!currentWord || feedback) return;

        // Optimistic check
        const players = room.players || {};
        const myPlayer = players[userId];
        if (!myPlayer) return;

        const maxPasses = Math.floor((words.length || 10) * 0.2); // Default 10 if words empty locally
        const currentPasses = myPlayer.passCount || 0;

        if (currentPasses >= maxPasses) {
            alert(`패스 횟수를 초과했습니다. (최대 ${maxPasses}회)`);
            return;
        }

        if (window.confirm(`단어를 패스하시겠습니까? 점수가 50점 차감됩니다.\n(남은 패스: ${maxPasses - currentPasses - 1}회)`)) {
            // Read-Modify-Write cycle
            // We really should use stored procedures for atomic updates, but...

            const { data: latestRoom } = await supabase.from('battles').select('players, current_word_index').eq('id', roomId).single();
            if (!latestRoom) return;

            const latestPlayers = latestRoom.players || {};
            if (latestPlayers[userId]) {
                latestPlayers[userId].score = (latestPlayers[userId].score || 0) - 50;
                latestPlayers[userId].passCount = (latestPlayers[userId].passCount || 0) + 1;

                await supabase
                    .from('battles')
                    .update({
                        players: latestPlayers,
                        current_word_index: (latestRoom.current_word_index || 0) + 1
                    })
                    .eq('id', roomId);
            }

            setFeedback('pass');
            setTimeout(() => setFeedback(null), 500);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!currentWord || feedback) return;

        if (userInput.trim().toLowerCase() === currentWord.english.toLowerCase()) {
            setFeedback('correct');

            const { data: latestRoom } = await supabase.from('battles').select('players, current_word_index').eq('id', roomId).single();
            if (!latestRoom) return;

            const latestPlayers = latestRoom.players || {};
            if (latestPlayers[userId]) {
                latestPlayers[userId].score = (latestPlayers[userId].score || 0) + 100;

                await supabase
                    .from('battles')
                    .update({
                        players: latestPlayers,
                        current_word_index: (latestRoom.current_word_index || 0) + 1,
                        last_winner: userId
                    })
                    .eq('id', roomId);
            }
        } else {
            setFeedback('incorrect');
            setTimeout(() => setFeedback(null), 500);
        }
    };

    const refreshRoom = () => {
        fetchRoom();
    };

    if (!room) return <div className="min-h-screen flex items-center justify-center text-white">로딩 중...</div>;

    const players = room.players || {};
    const myPlayer = players[userId];
    // If kicked or removed
    if (!myPlayer && room.status !== 'finished') { // Allow viewing finished game maybe? or just redirect
        // navigate('/student/battle');
        // return null;
    }

    const opponent = Object.values(players).find(p => p.id !== userId);
    const maxPasses = Math.floor((words.length || 10) * 0.2);
    const currentPasses = myPlayer?.passCount || 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4">
            {/* Header */}
            <header className="flex justify-between items-center mb-8 max-w-4xl mx-auto">
                <div className="flex items-center space-x-4">
                    <button onClick={handleLeave} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <LogOut className="w-6 h-6 text-gray-400" />
                    </button>
                    <div>
                        <div className="flex items-center space-x-2">
                            <h1 className="text-xl font-bold">{room.name}</h1>
                            <span className="text-xs text-gray-600 font-mono">#{roomId.slice(0, 6)}</span>
                        </div>
                        <span className="text-sm text-gray-400">
                            {room.status === 'waiting' ? '대기 중...' : room.status === 'playing' ? '게임 진행 중' : '게임 종료'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    <button onClick={refreshRoom} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors" title="새로고침">
                        <Zap className="w-4 h-4 text-yellow-400" />
                    </button>
                    <div className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded-full">
                        <Users className="w-5 h-5 text-indigo-400" />
                        <span className="font-bold">{room.player_count} / {room.max_players}</span>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto">
                {room.status === 'waiting' && myPlayer && (
                    <div className="bg-gray-800 rounded-2xl p-8 text-center shadow-xl border border-gray-700">
                        <div className="flex justify-center space-x-12 mb-12">
                            {/* Player 1 (Me) */}
                            <div className="flex flex-col items-center">
                                <div className="w-24 h-24 bg-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
                                    <span className="text-3xl font-bold">{myPlayer.name[0]}</span>
                                </div>
                                <span className="text-xl font-bold">{myPlayer.name} (나)</span>
                                <span className="text-green-400 text-sm mt-1">준비 완료</span>
                            </div>

                            {/* VS */}
                            <div className="flex items-center">
                                <span className="text-4xl font-black text-gray-600 italic">VS</span>
                            </div>

                            {/* Player 2 (Opponent) */}
                            <div className="flex flex-col items-center">
                                {opponent ? (
                                    <>
                                        <div className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-500/30">
                                            <span className="text-3xl font-bold">{opponent.name[0]}</span>
                                        </div>
                                        <span className="text-xl font-bold">{opponent.name}</span>
                                        <span className="text-green-400 text-sm mt-1">준비 완료</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mb-4 border-2 border-dashed border-gray-500 animate-pulse">
                                            <Users className="w-8 h-8 text-gray-500" />
                                        </div>
                                        <span className="text-gray-500">상대방 기다리는 중...</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {room.host_id === userId && (
                            <button
                                onClick={handleStartGame}
                                disabled={!opponent}
                                className={`
                                    px-8 py-4 rounded-xl font-bold text-xl transition-all transform hover:scale-105
                                    ${opponent
                                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/50'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
                                `}
                            >
                                {opponent ? '게임 시작!' : '플레이어 대기 중...'}
                            </button>
                        )}
                        {room.host_id !== userId && (
                            <div className="text-gray-400 animate-pulse">
                                방장이 게임을 시작하기를 기다리고 있습니다...
                            </div>
                        )}
                    </div>
                )}

                {room.status === 'playing' && currentWord && myPlayer && (
                    <div className="space-y-8">
                        {/* Score Board */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className={`bg-indigo-900/50 p-4 rounded-xl border-2 ${room.last_winner === userId ? 'border-yellow-400' : 'border-indigo-500/30'}`}>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-indigo-200">나 ({myPlayer.name})</span>
                                    <span className="text-2xl font-bold text-white">{myPlayer.score}</span>
                                </div>
                                <div className="w-full bg-gray-700 h-2 rounded-full mt-2 overflow-hidden">
                                    <div className="bg-indigo-500 h-full transition-all" style={{ width: `${(myPlayer.score / 1000) * 100}%` }}></div>
                                </div>
                            </div>
                            <div className={`bg-red-900/50 p-4 rounded-xl border-2 ${room.last_winner === opponent?.id ? 'border-yellow-400' : 'border-red-500/30'}`}>
                                <div className="flex justify-between items-center">
                                    <span className="font-bold text-red-200">상대방 ({opponent?.name})</span>
                                    <span className="text-2xl font-bold text-white">{opponent?.score || 0}</span>
                                </div>
                                <div className="w-full bg-gray-700 h-2 rounded-full mt-2 overflow-hidden">
                                    <div className="bg-red-500 h-full transition-all" style={{ width: `${(opponent?.score / 1000) * 100}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Game Area */}
                        <div className="bg-gray-800 rounded-3xl p-12 text-center shadow-2xl border border-gray-700 relative overflow-hidden">
                            {/* Feedback Overlay */}
                            {feedback && (
                                <div className={`absolute inset-0 flex items-center justify-center z-10 ${feedback === 'correct' ? 'bg-green-500/20' : feedback === 'pass' ? 'bg-yellow-500/20' : 'bg-red-500/20'} backdrop-blur-sm transition-all`}>
                                    {feedback === 'correct' ? (
                                        <CheckCircle className="w-32 h-32 text-green-400 animate-bounce" />
                                    ) : feedback === 'pass' ? (
                                        <div className="text-center">
                                            <span className="text-6xl font-bold text-yellow-400 block mb-2">PASS!</span>
                                            <span className="text-xl text-yellow-200">-50점</span>
                                        </div>
                                    ) : (
                                        <XCircle className="w-32 h-32 text-red-400 animate-shake" />
                                    )}
                                </div>
                            )}

                            <div className="mb-8">
                                <span className="text-gray-400 text-sm uppercase tracking-widest">Current Word</span>
                            </div>

                            <h2 className="text-5xl font-bold text-white mb-4 drop-shadow-lg">{currentWord.korean}</h2>

                            {room.difficulty === 'easy' && (
                                <div className="mb-6 text-indigo-300 font-mono text-xl">
                                    Hint: {currentWord.english[0]}
                                    {currentWord.english.slice(1).split('').map(() => '_').join(' ')}
                                </div>
                            )}

                            {room.difficulty === 'hard' && (
                                <div className="mb-6">
                                    <div className="w-full bg-gray-700 h-4 rounded-full overflow-hidden relative">
                                        <div
                                            className={`h-full transition-all duration-1000 ${timeLeft <= 3 ? 'bg-red-500' : 'bg-green-500'}`}
                                            style={{ width: `${(timeLeft / 10) * 100}%` }}
                                        ></div>
                                    </div>
                                    <p className={`mt-2 font-bold ${timeLeft <= 3 ? 'text-red-400' : 'text-green-400'}`}>
                                        남은 시간: {timeLeft}초
                                    </p>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="max-w-md mx-auto relative">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={userInput}
                                    onChange={(e) => setUserInput(e.target.value)}
                                    className="w-full bg-gray-900 border-2 border-gray-600 rounded-xl px-6 py-4 text-2xl text-center focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all"
                                    placeholder="영어 단어를 입력하세요"
                                    autoFocus
                                />
                                <div className="flex space-x-2 mt-4">
                                    <button
                                        type="button"
                                        onClick={handlePass}
                                        disabled={currentPasses >= maxPasses}
                                        className={`flex-1 py-3 rounded-xl font-bold transition-colors ${currentPasses >= maxPasses
                                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                            : 'bg-yellow-600 hover:bg-yellow-500 text-white'
                                            }`}
                                    >
                                        패스 ({currentPasses}/{maxPasses})
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-[2] py-3 bg-indigo-600 rounded-xl font-bold hover:bg-indigo-500 transition-colors text-white"
                                    >
                                        입력
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {room.status === 'finished' && winner && (
                    <div className="text-center py-12 animate-scale-in">
                        <Trophy className="w-32 h-32 text-yellow-400 mx-auto mb-6 animate-bounce" />
                        <h2 className="text-4xl font-bold mb-4">게임 종료!</h2>
                        <p className="text-2xl text-gray-300 mb-8">
                            승자는 <span className="text-yellow-400 font-bold">{winner.name}</span>입니다!
                        </p>
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={() => navigate('/student/battle')}
                                className="px-8 py-3 bg-gray-700 rounded-xl font-bold hover:bg-gray-600 transition-colors"
                            >
                                로비로 돌아가기
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
