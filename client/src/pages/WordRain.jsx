import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Heart, Trophy, Zap, Bomb, RefreshCw, DollarSign } from 'lucide-react';
import { supabase } from '../supabase';
import confetti from 'canvas-confetti';
import { addDollars, getRewardSettings, getDailyGameEarnings } from '../utils/dollarUtils';

export default function WordRain() {
    const [loading, setLoading] = useState(true);
    const [words, setWords] = useState([]);
    const [fallingWords, setFallingWords] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [score, setScore] = useState(0);
    const [lives, setLives] = useState(5);
    const [level, setLevel] = useState(1);
    const [gameState, setGameState] = useState('loading'); // loading, playing, gameover
    const [earnedDollars, setEarnedDollars] = useState(0);

    const navigate = useNavigate();
    const location = useLocation();

    // Use refs for game loop state to avoid closure staleness and excessive re-renders
    const lastSpawnTimeRef = useRef(0);
    const requestRef = useRef();
    const gameAreaRef = useRef(null);
    const inputRef = useRef(null);

    // Game Constants
    const SPAWN_RATE = 3000; // ms (slower spawn rate)
    const FALL_SPEED = 0.015; // Extremely slow speed
    const LEVEL_UP_SCORE = 500;

    // Fetch words
    useEffect(() => {
        const initializeGame = async () => {
            const { studyStartIndex, studyEndIndex, bookName } = location.state || {}; // Expecting academyId maybe? Default to localstorage user's academy 

            try {
                // We need academy_id for querying words properly, though book_name might be unique enough or user specific context
                // Let's rely on book_name and range for now, assuming book names are distinct per academy or we just query by book_name.
                // Better to filter by academy_id if possible, but location.state might not have it.
                // We can fetch user's academy_id or just query by book_name.

                let targetWords = [];
                const academyId = localStorage.getItem('academyId') || 'academy_default';

                if (studyStartIndex && studyEndIndex && bookName) {
                    const { data, error } = await supabase
                        .from('words')
                        .select('*')
                        .eq('academy_id', academyId)
                        .eq('book_name', bookName)
                        .gte('word_number', parseInt(studyStartIndex))
                        .lt('word_number', parseInt(studyEndIndex));

                    if (error) throw error;
                    targetWords = data || [];
                } else {
                    alert('잘못된 접근입니다. 학습 페이지에서 시작해주세요.');
                    navigate('/student');
                    return;
                }

                if (targetWords.length === 0) {
                    alert('게임할 단어가 없습니다.');
                    navigate('/student');
                    return;
                }

                setWords(targetWords);
                setLoading(false);
                setGameState('playing');

            } catch (err) {
                console.error(err);
                alert('게임 로딩 실패: ' + err.message);
                navigate('/student');
            }
        };

        initializeGame();
    }, [location.state, navigate]);

    // Handle Game Over Logic
    useEffect(() => {
        const handleGameOver = async () => {
            if (gameState === 'gameover') {
                const settings = await getRewardSettings();
                if (score >= settings.game_high_score_threshold) {
                    const userId = localStorage.getItem('userId');
                    if (!userId) return;

                    const dailyEarnings = await getDailyGameEarnings(userId);
                    const remainingLimit = (settings.game_daily_max_reward || 0.5) - dailyEarnings;

                    if (remainingLimit > 0) {
                        const rewardAmount = Math.min(settings.game_high_score_reward, remainingLimit);
                        if (rewardAmount > 0) {
                            await addDollars(userId, rewardAmount, `단어 비 게임 고득점 (${score}점)`, 'game_reward');
                            setEarnedDollars(rewardAmount);
                        }
                    }
                }
            }
        };

        handleGameOver();
    }, [gameState, score]);

    const spawnWord = useCallback(() => {
        if (words.length === 0) return;

        const randomWord = words[Math.floor(Math.random() * words.length)];
        const id = Date.now() + Math.random();
        const x = Math.random() * 70 + 15; // 15% to 85% width

        setFallingWords(prev => [
            ...prev,
            {
                id,
                word: randomWord.english,
                meaning: randomWord.korean,
                x,
                y: 15, // Start below header
                speed: FALL_SPEED + Math.random() * 0.2
            }
        ]);
    }, [words]);

    // Game Loop
    const updateGame = useCallback((time) => {
        if (gameState !== 'playing') return;

        setFallingWords(prev => {
            const nextWords = [];
            let livesLost = 0;

            prev.forEach(fw => {
                // If already dissolving, check if it's time to remove
                if (fw.isDissolving) {
                    if (Date.now() - fw.dissolveTime < 1000) { // 1 second dissolve animation
                        nextWords.push(fw);
                    }
                    return;
                }

                const nextY = fw.y + (fw.speed * (1 + (level * 0.01)));

                // Check collision with bottom (approx 85% of screen height)
                if (nextY > 85) {
                    livesLost++;
                    // Add to nextWords as dissolving
                    nextWords.push({
                        ...fw,
                        y: 85,
                        isDissolving: true,
                        dissolveTime: Date.now()
                    });
                } else {
                    nextWords.push({ ...fw, y: nextY });
                }
            });

            if (livesLost > 0) {
                setLives(l => {
                    const newLives = l - livesLost;
                    if (newLives <= 0) setGameState('gameover');
                    return Math.max(0, newLives);
                });
                // Shake effect
                if (gameAreaRef.current) {
                    gameAreaRef.current.classList.add('animate-shake');
                    setTimeout(() => gameAreaRef.current?.classList.remove('animate-shake'), 500);
                }
            }

            return nextWords;
        });

        // Spawn new words
        if (time - lastSpawnTimeRef.current > Math.max(800, SPAWN_RATE - (level * 100))) {
            spawnWord();
            lastSpawnTimeRef.current = time;
        }

        requestRef.current = requestAnimationFrame(updateGame);
    }, [gameState, level, spawnWord]);

    useEffect(() => {
        if (gameState === 'playing' && words.length > 0) {
            requestRef.current = requestAnimationFrame(updateGame);
            inputRef.current?.focus();
        }
        return () => cancelAnimationFrame(requestRef.current);
    }, [gameState, updateGame, words]);

    const checkAnswer = (value) => {
        const trimmedValue = value.toLowerCase().trim();
        const matchIndex = fallingWords.findIndex(fw => !fw.isDissolving && fw.word.toLowerCase() === trimmedValue);

        if (matchIndex !== -1) {
            // Correct!
            const matchedWord = fallingWords[matchIndex];

            // Remove word
            setFallingWords(prev => prev.filter((_, i) => i !== matchIndex));
            setUserInput('');

            // Score
            setScore(prev => {
                const newScore = prev + 100;
                if (Math.floor(newScore / LEVEL_UP_SCORE) > level - 1) {
                    setLevel(l => l + 1);
                }
                return newScore;
            });

            // Effects
            createExplosion(matchedWord.x, matchedWord.y);
            return true;
        }
        return false;
    };

    const handleInput = (e) => {
        const value = e.target.value;
        setUserInput(value);
        checkAnswer(value);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            const isCorrect = checkAnswer(userInput);
            if (!isCorrect) {
                // Optional: Feedback for incorrect enter press
                setUserInput(''); // Clear input to let them try again easily
            }
        }
    };

    const createExplosion = (x, y) => {
        confetti({
            particleCount: 30,
            spread: 50,
            origin: { x: x / 100, y: y / 100 },
            colors: ['#60A5FA', '#34D399', '#FBBF24'],
            ticks: 50,
            gravity: 2,
            scalar: 0.8
        });
    };

    const handleRestart = () => {
        setFallingWords([]);
        setScore(0);
        setLives(5);
        setLevel(1);
        setUserInput('');
        setGameState('playing');
        setEarnedDollars(0);
        lastSpawnTimeRef.current = 0;
    };

    const useBomb = () => {
        if (score >= 500) {
            setScore(s => s - 500);
            setFallingWords([]);
            confetti({
                particleCount: 100,
                spread: 360,
                origin: { x: 0.5, y: 0.5 },
                colors: ['#EF4444', '#F87171']
            });
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">로딩 중...</div>;

    return (
        <div className="fixed inset-0 bg-gray-900 overflow-hidden font-sans text-white touch-none">
            {/* Background Grid/Matrix Effect */}
            <div className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}
            ></div>

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-gray-900 to-transparent">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>

                <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-2">
                        <Trophy className="w-5 h-5 text-yellow-400 animate-bounce" />
                        <span className="text-xl font-bold">{score}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                            <Heart
                                key={i}
                                className={`w-6 h-6 transition-all duration-300 ${i < lives ? 'text-red-500 fill-red-500 scale-100' : 'text-gray-700 scale-90'}`}
                            />
                        ))}
                    </div>
                    <div className="flex items-center space-x-2">
                        <Zap className="w-5 h-5 text-blue-400 animate-pulse" />
                        <span className="text-lg font-bold">Lv. {level}</span>
                    </div>
                </div>
            </div>

            {/* Game Area */}
            <div ref={gameAreaRef} className="absolute inset-0 z-10">
                {fallingWords.map(fw => (
                    <div
                        key={fw.id}
                        className={`absolute transform -translate-x-1/2 text-center z-30 transition-all duration-100 ${fw.isDissolving ? 'animate-melt' : ''}`}
                        style={{
                            left: `${fw.x}%`,
                            top: `${fw.y}%`,
                        }}
                    >
                        <div className={`bg-gray-800/90 backdrop-blur-md px-4 py-2 rounded-xl border-2 border-yellow-400/50 shadow-[0_0_15px_rgba(250,204,21,0.3)] ${!fw.isDissolving && 'animate-pulse-slow hover:scale-110 transition-transform'}`}>
                            <span className="block text-lg text-yellow-300 font-bold mb-1 whitespace-nowrap drop-shadow-md">{fw.meaning}</span>
                            {/* Hint: Show first letter if getting close */}
                            {fw.y > 50 && !fw.isDissolving && (
                                <span className="block text-sm text-blue-300 font-mono font-bold animate-bounce">{fw.word[0]}...</span>
                            )}
                        </div>
                        {/* Connecting Line to top (optional visual) */}
                        {!fw.isDissolving && (
                            <div className="w-0.5 h-screen bg-gradient-to-b from-transparent via-yellow-400/20 to-transparent absolute -top-full left-1/2 -z-10"></div>
                        )}
                    </div>
                ))}
            </div>

            {/* Input Area */}
            <div className="absolute bottom-0 left-0 right-0 p-6 z-20 bg-gradient-to-t from-gray-900 via-gray-900/90 to-transparent">
                <div className="max-w-xl mx-auto relative">
                    <input
                        ref={inputRef}
                        type="text"
                        value={userInput}
                        onChange={handleInput}
                        onKeyDown={handleKeyDown}
                        placeholder="한글 뜻을 보고 영어 단어를 입력하세요!"
                        className="w-full px-6 py-4 bg-gray-800/80 border-2 border-blue-500/50 rounded-2xl text-center text-2xl font-bold text-white placeholder-gray-500 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/20 outline-none shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
                        autoFocus
                        disabled={gameState !== 'playing'}
                    />

                    {/* Bomb Button */}
                    <button
                        onClick={useBomb}
                        disabled={score < 500}
                        className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all transform hover:scale-110 active:scale-95 ${score >= 500 ? 'bg-red-500 hover:bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse' : 'bg-gray-700 text-gray-500'
                            }`}
                        title="폭탄 사용 (500점)"
                    >
                        <Bomb className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Game Over Modal */}
            {gameState === 'gameover' && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-gray-800 border border-gray-700 p-8 rounded-3xl text-center max-w-sm w-full shadow-2xl transform scale-100 animate-bounce-in">
                        <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-6 animate-bounce" />
                        <h2 className="text-3xl font-bold text-white mb-2">게임 종료</h2>
                        <p className="text-gray-400 mb-4">
                            최종 점수: <span className="text-yellow-400 font-bold text-2xl">{score}</span>
                        </p>

                        {earnedDollars > 0 && (
                            <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6 animate-pulse">
                                <p className="text-green-300 font-bold mb-1">획득한 보상</p>
                                <div className="flex items-center justify-center text-3xl font-bold text-green-400">
                                    <DollarSign className="w-8 h-8 mr-1" />
                                    {earnedDollars.toFixed(2)}
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <button
                                onClick={handleRestart}
                                className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center shadow-lg hover:shadow-blue-500/50"
                            >
                                <RefreshCw className="w-5 h-5 mr-2" />
                                다시 도전하기
                            </button>
                            <button
                                onClick={() => navigate('/student/study', { state: location.state })}
                                className="w-full py-3 bg-gray-700 text-gray-300 rounded-xl font-bold hover:bg-gray-600 transition-colors"
                            >
                                학습 화면으로 돌아가기
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-10px); }
                    75% { transform: translateX(10px); }
                }
                .animate-shake {
                    animation: shake 0.2s ease-in-out;
                }
                .animate-fade-in {
                    animation: fadeIn 0.3s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes pulse-slow {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.9; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 2s infinite;
                }
                @keyframes melt {
                    0% { transform: translate(-50%, 0) scale(1); opacity: 1; }
                    100% { transform: translate(-50%, 20px) scale(1.2, 0.5); opacity: 0; }
                }
                .animate-melt {
                    animation: melt 1s forwards;
                }
            `}</style>
        </div>
    );
}
