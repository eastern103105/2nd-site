import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Timer, Zap, Trophy, ArrowLeft, RefreshCw, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { supabase } from '../supabase';
import confetti from 'canvas-confetti';
import { addDollars, getRewardSettings, getDailyGameEarnings } from '../utils/dollarUtils';

export default function SpeedQuiz() {
    const [loading, setLoading] = useState(true);
    const [words, setWords] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [options, setOptions] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [maxTime, setMaxTime] = useState(0);
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [gameState, setGameState] = useState('loading'); // loading, ready, playing, success, fail
    const [feedback, setFeedback] = useState(null); // 'correct', 'incorrect'
    const [earnedDollars, setEarnedDollars] = useState(0);

    const navigate = useNavigate();
    const location = useLocation();
    const timerRef = useRef(null);

    // Initialize Game
    useEffect(() => {
        const initializeGame = async () => {
            const { studyStartIndex, studyEndIndex, bookName } = location.state || {}; // Expect academyId?

            if (!studyStartIndex || !studyEndIndex || !bookName) {
                alert('잘못된 접근입니다.');
                navigate('/student');
                return;
            }

            try {
                let targetWords = [];
                const academyId = localStorage.getItem('academyId') || 'academy_default';

                const { data, error } = await supabase
                    .from('words')
                    .select('*')
                    .eq('academy_id', academyId)
                    .eq('book_name', bookName)
                    .gte('word_number', parseInt(studyStartIndex))
                    .lt('word_number', parseInt(studyEndIndex));

                if (error) throw error;
                targetWords = data || [];

                if (targetWords.length < 4) {
                    alert('단어가 너무 적습니다. 최소 4개 이상의 단어가 필요합니다.');
                    navigate('/student');
                    return;
                }

                // Shuffle words
                for (let i = targetWords.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [targetWords[i], targetWords[j]] = [targetWords[j], targetWords[i]];
                }

                setWords(targetWords);
                // Set time: 3 seconds per word (Harder difficulty)
                const totalTime = targetWords.length * 3;
                setMaxTime(totalTime);
                setTimeLeft(totalTime);
                setGameState('ready');
                setLoading(false);

            } catch (err) {
                console.error(err);
                alert('게임 로딩 실패: ' + err.message);
                navigate('/student');
            }
        };

        initializeGame();
    }, [location.state, navigate]);

    // Generate Options when currentIndex changes
    useEffect(() => {
        if (words.length > 0 && currentIndex < words.length) {
            const current = words[currentIndex];
            const distractors = words
                .filter(w => w.id !== current.id)
                .sort(() => 0.5 - Math.random())
                .slice(0, 3);

            const newOptions = [...distractors, current]
                .sort(() => 0.5 - Math.random());

            setTimeout(() => setOptions(newOptions), 0);
        }
    }, [currentIndex, words]);

    // Timer Logic
    useEffect(() => {
        if (gameState === 'playing') {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 0.1) {
                        clearInterval(timerRef.current);
                        setGameState('fail');
                        return 0;
                    }
                    return prev - 0.1;
                });
            }, 100);
        }
        return () => clearInterval(timerRef.current);
    }, [gameState]);

    // Handle Game Success Reward
    useEffect(() => {
        const handleReward = async () => {
            if (gameState === 'success') {
                const settings = await getRewardSettings();
                if (score >= settings.game_high_score_threshold) {
                    const userId = localStorage.getItem('userId');
                    if (!userId) return;

                    const dailyEarnings = await getDailyGameEarnings(userId);
                    const remainingLimit = (settings.game_daily_max_reward || 0.5) - dailyEarnings;

                    if (remainingLimit > 0) {
                        const rewardAmount = Math.min(settings.game_high_score_reward, remainingLimit);
                        if (rewardAmount > 0) {
                            await addDollars(userId, rewardAmount, `스피드 퀴즈 고득점 (${score}점)`, 'game_reward');
                            setEarnedDollars(rewardAmount);
                        }
                    }
                }
            }
        };
        handleReward();
    }, [gameState, score]);

    const startGame = () => {
        setGameState('playing');
    };

    const handleAnswer = (selectedWord) => {
        if (gameState !== 'playing' || feedback) return;

        const currentWord = words[currentIndex];
        const isCorrect = selectedWord.id === currentWord.id;

        if (isCorrect) {
            setFeedback('correct');
            setScore(prev => prev + 100 + (combo * 10));
            setCombo(prev => prev + 1);

            // Bonus time for quick answers (max +2 sec)
            setTimeLeft(prev => Math.min(maxTime, prev + 2));

            if (currentIndex + 1 >= words.length) {
                // Game Clear
                setTimeout(() => {
                    endGame(true);
                }, 500);
            } else {
                setTimeout(() => {
                    setFeedback(null);
                    setCurrentIndex(prev => prev + 1);
                }, 300);
            }
        } else {
            setFeedback('incorrect');
            setCombo(0);
            setTimeLeft(prev => Math.max(0, prev - 5)); // Penalty
            setTimeout(() => {
                setFeedback(null);
            }, 500);
        }
    };

    const endGame = (success) => {
        clearInterval(timerRef.current);
        setGameState(success ? 'success' : 'fail');
        if (success) {
            triggerConfetti();
        }
    };

    const triggerConfetti = useCallback(() => {
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
    }, []);

    const handleRestart = () => {
        // Reshuffle
        const newWords = [...words].sort(() => 0.5 - Math.random());
        setWords(newWords);
        setCurrentIndex(0);
        setScore(0);
        setCombo(0);
        setTimeLeft(maxTime);
        setGameState('ready');
        setFeedback(null);
        setEarnedDollars(0);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-indigo-900 text-white">로딩 중...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 p-4 font-sans text-white overflow-hidden relative">
            {/* Background Particles (CSS only for simplicity) */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-10 left-10 w-20 h-20 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
                <div className="absolute top-10 right-10 w-20 h-20 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-20 h-20 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
            </div>

            <div className="max-w-md mx-auto relative z-10 h-full flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center mb-6 pt-4">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div className="flex items-center space-x-2">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                        <span className="font-bold text-xl">{score.toLocaleString()}</span>
                    </div>
                </div>

                {gameState === 'ready' && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
                        <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                            <Zap className="w-16 h-16 text-yellow-400" />
                        </div>
                        <h1 className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-pink-500">
                            스피드 퀴즈
                        </h1>
                        <p className="text-indigo-200 mb-8 text-lg">
                            제한 시간 안에<br />모든 단어를 맞추세요!
                        </p>
                        <button
                            onClick={startGame}
                            className="w-full py-4 bg-gradient-to-r from-pink-500 to-yellow-500 rounded-2xl font-bold text-xl shadow-lg transform transition hover:scale-105 active:scale-95"
                        >
                            게임 시작
                        </button>
                    </div>
                )}

                {gameState === 'playing' && (
                    <div className="flex-1 flex flex-col">
                        {/* Timer Bar */}
                        <div className="w-full h-4 bg-white/10 rounded-full mb-8 overflow-hidden relative">
                            <div
                                className={`h-full transition-all duration-100 ease-linear ${timeLeft < maxTime * 0.3 ? 'bg-red-500 shadow-[0_0_10px_red]' :
                                    timeLeft < maxTime * 0.6 ? 'bg-yellow-500' : 'bg-green-400'
                                    }`}
                                style={{ width: `${(timeLeft / maxTime) * 100}%` }}
                            />
                        </div>

                        {/* Combo Indicator */}
                        <div className="h-8 flex justify-center mb-4">
                            {combo > 1 && (
                                <div className="animate-bounce text-yellow-400 font-bold flex items-center space-x-1">
                                    <span>🔥</span>
                                    <span>{combo} COMBO!</span>
                                </div>
                            )}
                        </div>

                        {/* Question Card */}
                        <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 text-center mb-8 border border-white/20 shadow-xl relative overflow-hidden">
                            <span className="text-sm text-indigo-300 uppercase tracking-wider mb-2 block">Word {currentIndex + 1} / {words.length}</span>
                            <h2 className="text-4xl font-bold text-white mb-2">{words[currentIndex].english}</h2>

                            {/* Feedback Overlay */}
                            {feedback && (
                                <div className={`absolute inset-0 flex items-center justify-center backdrop-blur-sm transition-all ${feedback === 'correct' ? 'bg-green-500/30' : 'bg-red-500/30'
                                    }`}>
                                    {feedback === 'correct' ? (
                                        <CheckCircle className="w-20 h-20 text-green-400 animate-scale-in" />
                                    ) : (
                                        <XCircle className="w-20 h-20 text-red-400 animate-scale-in" />
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Options */}
                        <div className="grid grid-cols-1 gap-3">
                            {options.map((option, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleAnswer(option)}
                                    disabled={feedback !== null}
                                    className={`
                                        py-4 px-6 rounded-xl text-lg font-bold transition-all transform active:scale-98
                                        ${feedback === null
                                            ? 'bg-white text-indigo-900 hover:bg-indigo-50 shadow-md'
                                            : (option.id === words[currentIndex].id
                                                ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)] scale-105'
                                                : 'bg-white/50 text-indigo-900 opacity-50')
                                        }
                                    `}
                                >
                                    {option.korean}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {(gameState === 'success' || gameState === 'fail') && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center animate-scale-in">
                        {gameState === 'success' ? (
                            <div className="mb-6">
                                <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-4 animate-bounce" />
                                <h2 className="text-4xl font-bold text-white mb-2">미션 성공!</h2>
                                <p className="text-indigo-200 text-xl">모든 단어를 정복했습니다!</p>
                            </div>
                        ) : (
                            <div className="mb-6">
                                <Timer className="w-24 h-24 text-red-400 mx-auto mb-4 animate-pulse" />
                                <h2 className="text-4xl font-bold text-white mb-2">시간 초과!</h2>
                                <p className="text-indigo-200 text-xl">아쉽네요, 다시 도전해보세요!</p>
                            </div>
                        )}

                        <div className="bg-white/10 rounded-2xl p-6 w-full mb-8 backdrop-blur-md">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-indigo-200">최종 점수</span>
                                <span className="text-2xl font-bold text-white">{score.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-indigo-200">남은 시간</span>
                                <span className="text-xl font-bold text-white">{timeLeft.toFixed(1)}초</span>
                            </div>
                        </div>

                        {earnedDollars > 0 && (
                            <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6 animate-pulse">
                                <p className="text-green-300 font-bold mb-1">획득한 보상</p>
                                <div className="flex items-center justify-center text-3xl font-bold text-green-400">
                                    <DollarSign className="w-8 h-8 mr-1" />
                                    {earnedDollars.toFixed(2)}
                                </div>
                            </div>
                        )}

                        <div className="w-full space-y-3">
                            <button
                                onClick={handleRestart}
                                className="w-full py-4 bg-white text-indigo-900 rounded-xl font-bold text-lg hover:bg-indigo-50 transition-colors flex items-center justify-center"
                            >
                                <RefreshCw className="w-5 h-5 mr-2" />
                                다시 도전하기
                            </button>
                            <button
                                onClick={() => navigate('/student/study', { state: location.state })}
                                className="w-full py-4 bg-indigo-600/50 text-white rounded-xl font-bold text-lg hover:bg-indigo-600/70 transition-colors border border-white/20"
                            >
                                학습 화면으로 돌아가기
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes blob {
                    0% { transform: translate(0px, 0px) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0px, 0px) scale(1); }
                }
                .animate-blob {
                    animation: blob 7s infinite;
                }
                .animation-delay-2000 {
                    animation-delay: 2s;
                }
                .animation-delay-4000 {
                    animation-delay: 4s;
                }
                .animate-scale-in {
                    animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                @keyframes scaleIn {
                    from { transform: scale(0.5); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .animate-fade-in {
                    animation: fadeIn 0.5s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
