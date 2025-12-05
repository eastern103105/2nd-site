import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trophy, Check, HelpCircle, DollarSign } from 'lucide-react';
import { supabase } from '../supabase';
import confetti from 'canvas-confetti';
import { addDollars, getRewardSettings, getDailyGameEarnings } from '../utils/dollarUtils';

export default function WordScramble() {
    const [loading, setLoading] = useState(true);
    const [words, setWords] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [scrambled, setScrambled] = useState('');
    const [userInput, setUserInput] = useState('');
    const [feedback, setFeedback] = useState(null); // 'correct', 'incorrect', null
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [gameComplete, setGameComplete] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [earnedDollars, setEarnedDollars] = useState(0);

    const navigate = useNavigate();
    const location = useLocation();
    const inputRef = useRef(null);

    // Fetch words
    useEffect(() => {
        const initializeGame = async () => {
            const { studyStartIndex, studyEndIndex, bookName } = location.state || {}; // Expect academyId too?

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

                if (targetWords.length === 0) {
                    alert('게임할 단어가 없습니다.');
                    navigate('/student');
                    return;
                }

                // Shuffle words order
                for (let i = targetWords.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [targetWords[i], targetWords[j]] = [targetWords[j], targetWords[i]];
                }

                setWords(targetWords);
                setLoading(false);

            } catch (err) {
                console.error(err);
                alert('게임 로딩 실패: ' + err.message);
                navigate('/student');
            }
        };

        initializeGame();
    }, [location.state, navigate]);

    const shuffleWord = (word) => {
        const arr = word.split('');
        let shuffled = arr.slice();
        if (arr.length > 1) {
            while (shuffled.join('') === word) {
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
            }
        }
        return shuffled.join('');
    };

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

    // Set up current word
    useEffect(() => {
        if (words.length > 0 && currentIndex < words.length) {
            const word = words[currentIndex].english;
            setTimeout(() => {
                setScrambled(shuffleWord(word));
                setUserInput('');
                setFeedback(null);
                setShowHint(false);
            }, 0);
            // Focus input
            setTimeout(() => inputRef.current?.focus(), 100);
        } else if (words.length > 0 && currentIndex >= words.length) {
            setTimeout(() => {
                setGameComplete(true);
                triggerWinConfetti();
            }, 0);
        }
    }, [currentIndex, words]);

    // Handle Game Completion Reward
    useEffect(() => {
        const handleReward = async () => {
            if (gameComplete) {
                const settings = await getRewardSettings();
                if (score >= settings.game_high_score_threshold) {
                    const userId = localStorage.getItem('userId');
                    if (!userId) return;

                    const dailyEarnings = await getDailyGameEarnings(userId);
                    const remainingLimit = (settings.game_daily_max_reward || 0.5) - dailyEarnings;

                    if (remainingLimit > 0) {
                        const rewardAmount = Math.min(settings.game_high_score_reward, remainingLimit);
                        if (rewardAmount > 0) {
                            await addDollars(userId, rewardAmount, `단어 맞추기 게임 고득점 (${score}점)`, 'game_reward');
                            setEarnedDollars(rewardAmount);
                        }
                    }
                }
            }
        };
        handleReward();
    }, [gameComplete, score]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (gameComplete || feedback) return;

        const currentWord = words[currentIndex];
        if (userInput.trim().toLowerCase() === currentWord.english.toLowerCase()) {
            // Correct
            setFeedback('correct');
            setScore(prev => prev + 50); // 각 문제당 50점
            setStreak(prev => prev + 1);

            // Burst confetti
            confetti({
                particleCount: 50,
                spread: 60,
                origin: { y: 0.6 },
                colors: ['#FCD34D', '#F87171', '#60A5FA']
            });

            setTimeout(() => {
                setCurrentIndex(prev => prev + 1);
            }, 1000);
        } else {
            // Incorrect
            setFeedback('incorrect');
            setStreak(0);

            setTimeout(() => {
                setFeedback(null);
                inputRef.current?.focus();
            }, 800);
        }
    };

    const handleRestart = () => {
        const newWords = [...words];
        for (let i = newWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newWords[i], newWords[j]] = [newWords[j], newWords[i]];
        }
        setWords(newWords);
        setCurrentIndex(0);
        setScore(0);
        setStreak(0);
        setGameComplete(false);
        setEarnedDollars(0);
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-indigo-900 text-white">로딩 중...</div>;

    const currentWord = words[currentIndex];
    if (!currentWord && !gameComplete) return <div className="min-h-screen flex items-center justify-center bg-indigo-900 text-white">단어 로딩 중...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 p-4 md:p-8 font-sans overflow-hidden relative">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-20 w-40 h-40 bg-yellow-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
                <div className="absolute bottom-20 right-20 w-40 h-40 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
            </div>

            <div className="max-w-2xl mx-auto relative z-10">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center text-indigo-200 hover:text-white transition-colors bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm"
                    >
                        <ArrowLeft className="w-5 h-5 mr-1" />
                        돌아가기
                    </button>
                    <div className="flex items-center space-x-4">
                        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 shadow-lg flex items-center space-x-2">
                            <span className="text-yellow-400 font-bold">🔥 {streak}</span>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20 shadow-lg flex items-center space-x-2">
                            <span className="text-indigo-200 text-sm">점수</span>
                            <span className="font-bold text-white">{score}</span>
                        </div>
                    </div>
                </div>

                {!gameComplete ? (
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 md:p-12 text-center relative overflow-hidden">
                        {/* Progress Bar */}
                        <div className="absolute top-0 left-0 w-full h-2 bg-white/10">
                            <div
                                className="h-full bg-gradient-to-r from-yellow-400 to-pink-500 transition-all duration-300 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                                style={{ width: `${((currentIndex) / words.length) * 100}%` }}
                            />
                        </div>

                        <div className="mb-8 mt-4">
                            <span className="inline-block px-4 py-1 bg-white/10 text-indigo-200 rounded-full text-sm font-medium mb-4 border border-white/10">
                                {currentIndex + 1} / {words.length}
                            </span>
                            <h2 className="text-3xl md:text-4xl font-bold text-white mb-2 drop-shadow-lg">
                                {currentWord?.korean}
                            </h2>
                            {showHint && currentWord && (
                                <p className="text-yellow-300 font-medium animate-pulse mt-2">
                                    첫 글자: <span className="text-xl font-bold">{currentWord.english[0]}</span>
                                </p>
                            )}
                        </div>

                        {/* Scrambled Word */}
                        <div className="mb-8 overflow-y-auto max-h-60 custom-scrollbar p-2">
                            <div className="flex justify-center flex-wrap gap-2 md:gap-3">
                                {scrambled.split('').map((char, i) => (
                                    <span
                                        key={i}
                                        className={`
                                            w-8 h-10 md:w-12 md:h-16 flex items-center justify-center 
                                            bg-white text-indigo-900 text-lg md:text-3xl font-bold rounded-lg shadow-md
                                            transform transition-all hover:-translate-y-1 hover:shadow-lg cursor-default
                                            border-b-2 md:border-b-4 border-indigo-200
                                        `}
                                    >
                                        {char}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSubmit} className="relative max-w-md mx-auto">
                            <input
                                ref={inputRef}
                                type="text"
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                className={`
                                    w-full px-6 py-4 text-center text-2xl font-bold rounded-2xl border-2 outline-none transition-all shadow-inner
                                    ${feedback === 'correct' ? 'border-green-400 bg-green-500/20 text-green-300' :
                                        feedback === 'incorrect' ? 'border-red-400 bg-red-500/20 text-red-300 animate-shake' :
                                            'border-white/20 bg-white/10 text-white focus:border-yellow-400 focus:bg-white/20'}
                                `}
                                placeholder="정답을 입력하세요"
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="absolute right-2 top-2 bottom-2 px-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl hover:from-yellow-500 hover:to-orange-600 transition-all shadow-lg flex items-center transform active:scale-95"
                            >
                                <Check className="w-6 h-6" />
                            </button>
                        </form>

                        {/* Hint Button */}
                        <div className="mt-8">
                            <button
                                onClick={() => {
                                    setShowHint(true);
                                    setScore(prev => Math.max(0, prev - 5));
                                }}
                                disabled={showHint}
                                className="text-indigo-300 hover:text-yellow-300 text-sm flex items-center justify-center mx-auto space-x-2 transition-colors group"
                            >
                                <div className="p-1 rounded-full bg-white/10 group-hover:bg-yellow-400/20 transition-colors">
                                    <HelpCircle className="w-4 h-4" />
                                </div>
                                <span>힌트 보기 (-5점)</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Game Complete */
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl p-8 md:p-12 text-center animate-fade-in-up">
                        <div className="relative inline-block">
                            <div className="absolute inset-0 bg-yellow-400 blur-2xl opacity-30 rounded-full animate-pulse"></div>
                            <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-6 relative z-10 animate-bounce" />
                        </div>
                        <h2 className="text-4xl font-bold text-white mb-2">단어 마스터!</h2>
                        <p className="text-indigo-200 mb-8 text-lg">
                            모든 단어를 정복했습니다!<br />
                            최종 점수: <span className="text-yellow-400 font-bold text-2xl">{score}점</span>
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

                        <div className="space-y-3 max-w-xs mx-auto">
                            <button
                                onClick={handleRestart}
                                className="w-full py-3 bg-white text-indigo-900 rounded-xl font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center shadow-lg"
                            >
                                <RefreshCw className="w-5 h-5 mr-2" />
                                다시 하기
                            </button>
                            <button
                                onClick={() => navigate('/student/test', { state: location.state })}
                                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg border border-white/20"
                            >
                                시험 보러 가기
                            </button>
                            <button
                                onClick={() => navigate('/student/study', { state: location.state })}
                                className="w-full py-3 bg-transparent text-indigo-200 rounded-xl font-bold hover:bg-white/10 transition-colors border border-white/10"
                            >
                                학습 화면으로 돌아가기
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    25% { transform: translateX(-5px); }
                    75% { transform: translateX(5px); }
                }
                .animate-shake {
                    animation: shake 0.4s ease-in-out;
                }
                .animate-fade-in-up {
                    animation: fadeInUp 0.5s ease-out;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
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
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.5);
                }
            `}</style>
        </div>
    );
}
