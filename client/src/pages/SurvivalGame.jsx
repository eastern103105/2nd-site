import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';
import { Heart, Zap, Skull, Trophy, LogOut, Users } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function SurvivalGame() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const userId = localStorage.getItem('userId');
    const [userName, setUserName] = useState('');

    // Game State
    const [room, setRoom] = useState(null);
    const [words, setWords] = useState([]);
    const [fallingWords, setFallingWords] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [gameState, setGameState] = useState('loading'); // loading, waiting, playing, dead, finished
    const [myStatus, setMyStatus] = useState({ hp: 100, gauge: 0, score: 0, alive: true });
    const [activeEffect, setActiveEffect] = useState(null); // fog, speed, etc.
    const [winner, setWinner] = useState(null);

    // Refs
    const lastSpawnTimeRef = useRef(0);
    const requestRef = useRef();
    const gameAreaRef = useRef(null);
    const inputRef = useRef(null);
    const speedMultiplierRef = useRef(1);

    // Constants
    const SPAWN_RATE = 3000;
    const BASE_SPEED = 0.015;
    const GAUGE_PER_WORD = 20;

    // Fetch User Info
    useEffect(() => {
        const fetchUser = async () => {
            const { data } = await supabase.from('users').select('name').eq('id', userId).single();
            if (data) setUserName(data.name);
        };
        fetchUser();
    }, [userId]);

    // 2. Handle Incoming Effects
    const handleIncomingEffect = useCallback((effectType) => {
        setActiveEffect(effectType);

        // Visual Feedback
        const colors = { fog: '#6B7280', speed: '#EF4444', flash: '#FCD34D' };
        confetti({
            particleCount: 50,
            spread: 360,
            origin: { x: 0.5, y: 0.5 },
            colors: [colors[effectType] || '#ffffff']
        });

        // Apply Logic
        if (effectType === 'speed') {
            speedMultiplierRef.current = 2.5;
        }

        // Clear effect after duration
        setTimeout(() => {
            setActiveEffect(null);
            speedMultiplierRef.current = 1;
        }, 5000); // 5 seconds duration
    }, []);

    // 1. Room Sync & Player Management
    const fetchRoom = useCallback(async () => {
        const { data, error } = await supabase.from('battles').select('*').eq('id', roomId).single();
        if (error) {
            console.error("Error fetching room:", error);
            // alert('방이 존재하지 않거나 삭제되었습니다.'); 
            return;
        }
        setRoom(data);
    }, [roomId]);

    useEffect(() => {
        fetchRoom();

        const channel = supabase
            .channel(`survival_room_${roomId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'battles', filter: `id=eq.${roomId}` }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    alert('방이 삭제되었습니다.');
                    navigate('/student/survival');
                } else {
                    const newData = payload.new;
                    setRoom(newData);

                    // Sync my status checks
                    if (newData.players && newData.players[userId]) {
                        const me = newData.players[userId];
                        if (me.effect && me.effect !== activeEffect) {
                            handleIncomingEffect(me.effect);
                            // Clear effect
                            const updatedPlayers = { ...newData.players };
                            updatedPlayers[userId].effect = null;
                            supabase.from('battles').update({ players: updatedPlayers }).eq('id', roomId);
                        }
                    }

                    // Game Loop Triggers
                    if (newData.status === 'playing') {
                        if (gameState === 'loading' || gameState === 'waiting') {
                            setGameState('playing');
                            if (newData.game_words && words.length === 0) {
                                setWords(newData.game_words);
                            }
                        }
                    } else if (newData.status === 'finished') {
                        if (gameState !== 'finished') {
                            setGameState('finished');
                            if (newData.winner_id && newData.players[newData.winner_id]) {
                                setWinner(newData.players[newData.winner_id]);
                            }
                        }
                    } else if (newData.status === 'waiting') {
                        if (gameState === 'loading') setGameState('waiting');
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, navigate, userId, gameState, activeEffect, words.length, handleIncomingEffect, fetchRoom]);


    // 5. Helpers
    const checkWinner = useCallback(async () => {
        if (!room || room.host_id !== userId) return;

        // Fetch fresh to be sure
        const { data: freshRoom } = await supabase.from('battles').select('players, status').eq('id', roomId).single();
        if (!freshRoom) return;

        const players = Object.values(freshRoom.players || {});
        const alivePlayers = players.filter(p => p.alive);

        if (alivePlayers.length === 1 && players.length > 1) {
            await supabase.from('battles').update({
                status: 'finished',
                winner_id: alivePlayers[0].id
            }).eq('id', roomId);
        } else if (alivePlayers.length === 0) {
            await supabase.from('battles').update({
                status: 'finished'
            }).eq('id', roomId);
        }
    }, [room, roomId, userId]);

    const handleDeath = useCallback(async () => {
        setGameState('dead');
        setMyStatus(prev => ({ ...prev, hp: 0, alive: false }));

        // Optimistic update local first? No, need to update DB.
        // We need to fetch current players, update, and push.
        const { data: freshRoom } = await supabase.from('battles').select('players').eq('id', roomId).single();
        if (freshRoom) {
            const players = freshRoom.players || {};
            if (players[userId]) {
                players[userId].alive = false;
                players[userId].hp = 0;
                await supabase.from('battles').update({ players }).eq('id', roomId);
            }
        }
        checkWinner();
    }, [roomId, userId, checkWinner]);

    const updateMyStatusInDb = useCallback(async (newStatus) => {
        // Debounce or periodic update would be better, but for now update on major changes or periodically
        // Realtime updates for HP might be too frequent if done every frame.
        // We only update DB on death or periodically? 
        // Let's update DB when HP changes by a significant amount or score changes.
        // For simplicity, we update on score change/HP change in handleInput/damage. 
        // To avoid spamming, strict lock?

        // Actually, let's just fetch-update
        const { data: freshRoom } = await supabase.from('battles').select('players').eq('id', roomId).single();
        if (freshRoom) {
            const players = freshRoom.players || {};
            if (players[userId]) {
                players[userId].hp = newStatus.hp;
                players[userId].score = newStatus.score;
                players[userId].alive = newStatus.alive;
                await supabase.from('battles').update({ players }).eq('id', roomId);
            }
        }
    }, [roomId, userId]);


    const spawnWord = useCallback(() => {
        if (words.length === 0) return;
        const randomWord = words[Math.floor(Math.random() * words.length)];
        setFallingWords(prev => [
            ...prev,
            {
                id: Date.now() + Math.random(),
                word: randomWord.english,
                meaning: randomWord.korean,
                x: Math.random() * 70 + 15,
                y: 10,
                speed: BASE_SPEED + Math.random() * 0.02
            }
        ]);
    }, [words, BASE_SPEED]);

    const updateGameRef = useRef();

    // 3. Game Loop
    const updateGame = useCallback((time) => {
        if (gameState !== 'playing') return;

        setFallingWords(prev => {
            const nextWords = [];
            let damageTaken = 0;

            prev.forEach(fw => {
                if (fw.isDissolving) {
                    if (Date.now() - fw.dissolveTime < 500) nextWords.push(fw);
                    return;
                }

                const moveAmount = (fw.speed * speedMultiplierRef.current);
                const nextY = fw.y + moveAmount;

                // End game area earlier (75%)
                if (nextY > 75) {
                    damageTaken += 10;
                    nextWords.push({ ...fw, y: 75, isDissolving: true, dissolveTime: Date.now() });
                } else {
                    nextWords.push({ ...fw, y: nextY });
                }
            });

            if (damageTaken > 0) {
                setMyStatus(prev => {
                    const newHp = Math.max(0, prev.hp - damageTaken);
                    if (newHp <= 0 && prev.alive) {
                        handleDeath();
                        return { ...prev, hp: 0, alive: false };
                    }
                    if (prev.hp !== newHp) {
                        // Trigger DB update (async, don't await)
                        updateMyStatusInDb({ ...prev, hp: newHp });
                    }
                    return { ...prev, hp: newHp };
                });

                if (gameAreaRef.current) {
                    gameAreaRef.current.classList.add('animate-shake');
                    setTimeout(() => gameAreaRef.current?.classList.remove('animate-shake'), 500);
                }
            }

            return nextWords;
        });

        // Spawn
        if (time - lastSpawnTimeRef.current > SPAWN_RATE / speedMultiplierRef.current) {
            spawnWord();
            lastSpawnTimeRef.current = time;
        }

        requestRef.current = requestAnimationFrame((t) => updateGameRef.current(t));
    }, [gameState, handleDeath, spawnWord, SPAWN_RATE, updateMyStatusInDb]);

    useEffect(() => {
        updateGameRef.current = updateGame;
    }, [updateGame]);

    useEffect(() => {
        if (gameState === 'playing' && words.length > 0) {
            requestRef.current = requestAnimationFrame((t) => updateGameRef.current(t));
            inputRef.current?.focus();
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [gameState, words.length]);

    const handleInput = (e) => {
        const value = e.target.value;
        setUserInput(value);

        const trimmed = value.trim().toLowerCase();
        const matchIndex = fallingWords.findIndex(fw => !fw.isDissolving && fw.word.toLowerCase() === trimmed);

        if (matchIndex !== -1) {
            const word = fallingWords[matchIndex];
            setFallingWords(prev => prev.filter((_, i) => i !== matchIndex));
            setUserInput('');

            setMyStatus(prev => {
                const newScore = prev.score + 100;
                const newGauge = Math.min(100, prev.gauge + GAUGE_PER_WORD);
                // Trigger DB update
                updateMyStatusInDb({ ...prev, score: newScore, gauge: newGauge });
                return { ...prev, score: newScore, gauge: newGauge };
            });

            confetti({
                particleCount: 20,
                spread: 40,
                origin: { x: word.x / 100, y: word.y / 100 },
                colors: ['#34D399', '#60A5FA']
            });
        }
    };

    const handleStartGame = async () => {
        if (room.player_count < 2) {
            alert("최소 2명이 필요합니다.");
            return;
        }

        try {
            let targetBook = room.selected_book;
            // Assuming simplified fetching for now
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            let gameWords = [];
            if (!targetBook) {
                // Fetch random book?
                // For now, prompt user or use '기본'
                targetBook = '기본';
            }

            const { data } = await supabase.from('words').select('*').eq('book_name', targetBook).eq('academy_id', academyId).limit(50);
            if (data) gameWords = data;

            if (gameWords.length === 0) {
                alert("단어가 없습니다.");
                return;
            }

            const shuffled = gameWords.sort(() => 0.5 - Math.random()).slice(0, 50);

            await supabase.from('battles').update({
                status: 'playing',
                game_words: shuffled,
                // start_time: new Date().toISOString()
            }).eq('id', roomId);

        } catch (e) {
            console.error(e);
        }
    };

    const handleLeave = async () => {
        if (window.confirm("나가시겠습니까?")) {
            if (room.host_id === userId) {
                await supabase.from('battles').delete().eq('id', roomId);
            } else {
                const { data: latestRoom } = await supabase.from('battles').select('players, player_count').eq('id', roomId).single();
                if (latestRoom) {
                    const players = latestRoom.players || {};
                    delete players[userId];
                    await supabase.from('battles').update({
                        players,
                        player_count: Math.max(0, latestRoom.player_count - 1)
                    }).eq('id', roomId);
                }
            }
            navigate('/student/survival');
        }
    };

    if (!room) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">로딩 중...</div>;

    const playersList = Object.values(room.players || {});

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="w-full h-[90vh] bg-gray-900 text-white font-sans overflow-hidden flex rounded-2xl shadow-2xl border border-gray-800">
                {/* Left: My Game Area */}
                <div className="flex-1 relative border-r border-gray-700">
                    {/* Effect Overlay */}
                    {activeEffect === 'fog' && <div className="absolute inset-0 bg-gray-900/90 z-40 backdrop-blur-sm flex items-center justify-center text-4xl font-bold animate-pulse">안개 주의!</div>}
                    {activeEffect === 'flash' && <div className="absolute inset-0 bg-white z-50 animate-ping"></div>}

                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-30 bg-gradient-to-b from-gray-900 to-transparent">
                        <div className="flex items-center space-x-4">
                            <button onClick={handleLeave} className="p-2 bg-gray-800 rounded-full hover:bg-gray-700"><LogOut className="w-5 h-5" /></button>
                            <div className="flex items-center space-x-2">
                                <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                                <div className="w-32 h-4 bg-gray-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-500 transition-all" style={{ width: `${myStatus.hp}%` }}></div>
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Game Canvas */}
                    <div ref={gameAreaRef} className="absolute inset-0 z-10">
                        {gameState === 'waiting' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/50">
                                <h2 className="text-4xl font-bold mb-4">대기실</h2>
                                <p className="mb-8 text-xl">참가자: {room.player_count} / {room.max_players}</p>
                                {
                                    room.host_id === userId ? (
                                        <button onClick={handleStartGame} className="px-8 py-4 bg-red-600 rounded-xl font-bold text-xl hover:bg-red-500 transition-all shadow-lg shadow-red-600/50 animate-pulse">
                                            게임 시작
                                        </button>
                                    ) : (
                                        <p className="text-gray-400 animate-pulse">호스트가 시작하기를 기다리는 중...</p>
                                    )
                                }
                            </div >
                        )
                        }

                        {
                            gameState === 'dead' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-red-900/80 backdrop-blur-sm">
                                    <Skull className="w-24 h-24 text-white mb-4" />
                                    <h2 className="text-5xl font-bold mb-2">YOU DIED</h2>
                                    <p className="text-xl text-red-200">관전 모드로 전환됩니다...</p>
                                </div>
                            )
                        }

                        {
                            gameState === 'finished' && winner && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/80 backdrop-blur-md">
                                    <Trophy className="w-32 h-32 text-yellow-400 mb-6 animate-bounce" />
                                    <h2 className="text-4xl font-bold mb-4">게임 종료!</h2>
                                    <p className="text-2xl mb-8">승자: <span className="text-yellow-400 font-bold">{winner.name}</span></p>
                                    <button onClick={() => navigate('/student/survival')} className="px-6 py-3 bg-gray-700 rounded-lg hover:bg-gray-600">로비로 나가기</button>
                                </div>
                            )
                        }

                        {
                            fallingWords.map(fw => (
                                <div key={fw.id} className="absolute transform -translate-x-1/2" style={{ left: `${fw.x}%`, top: `${fw.y}%` }}>
                                    <div className={`px-4 py-2 rounded-xl border-2 ${fw.isDissolving ? 'bg-red-500/50 border-red-500 scale-90 opacity-50' : 'bg-gray-800/80 border-blue-400/50 backdrop-blur-md'}`}>
                                        <span className="text-lg font-bold text-white block">{fw.meaning}</span>
                                        {fw.y > 10 && !fw.isDissolving && (
                                            <div className="flex flex-col items-center mt-1">
                                                <span className="text-xs text-blue-300 font-mono font-bold">{fw.word[0]}...</span>
                                                <span className="text-[10px] text-gray-400">({fw.word.length}글자)</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        }
                    </div >

                    {/* Input Area */}
                    < div className="absolute bottom-0 left-0 right-0 p-6 z-50 bg-gradient-to-t from-gray-900 to-transparent" >
                        <div className="max-w-xl mx-auto flex space-x-4">
                            <input
                                ref={inputRef}
                                type="text"
                                value={userInput}
                                onChange={handleInput}
                                className="flex-1 px-6 py-4 bg-gray-800/90 border-2 border-gray-600 rounded-2xl text-center text-2xl font-bold focus:border-red-500 focus:ring-4 focus:ring-red-500/20 outline-none transition-all"
                                placeholder={gameState === 'playing' ? "단어를 입력하세요!" : ""}
                                disabled={gameState !== 'playing'}
                                autoFocus
                            />
                        </div>
                    </div >
                </div >

                {/* Right: Opponents Status */}
                < div className="w-64 bg-gray-800 border-l border-gray-700 p-4 overflow-y-auto" >
                    <h3 className="text-gray-400 font-bold mb-4 flex items-center">
                        <Users className="w-4 h-4 mr-2" />
                        생존자 ({playersList.filter(p => p.alive).length})
                    </h3>
                    <div className="space-y-3">
                        {playersList.sort((a, b) => b.score - a.score).map(player => (
                            <div key={player.id} className={`p-3 rounded-xl border ${player.alive ? 'bg-gray-700 border-gray-600' : 'bg-gray-900 border-gray-800 opacity-50'} ${player.id === userId ? 'ring-2 ring-blue-500' : ''}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className={`font-bold ${player.id === userId ? 'text-blue-400' : 'text-white'}`}>
                                        {player.name} {player.id === userId && '(나)'}
                                    </span>
                                    {!player.alive && <Skull className="w-4 h-4 text-gray-500" />}
                                </div>
                                {player.alive && (
                                    <>
                                        <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden mb-1">
                                            <div className="h-full bg-red-500" style={{ width: `${player.hp}%` }}></div>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>HP {player.hp}</span>
                                            <span>{player.score}점</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div >
            </div>
        </div>
    );
}
