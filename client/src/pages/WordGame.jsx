import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trophy, Timer, Move, DollarSign } from 'lucide-react';
import { supabase } from '../supabase';
import confetti from 'canvas-confetti';
import { addDollars, getRewardSettings, getDailyGameEarnings } from '../utils/dollarUtils';

export default function WordGame() {
    const [loading, setLoading] = useState(true);
    const [cards, setCards] = useState([]);
    const [flippedCards, setFlippedCards] = useState([]);
    const [matchedPairs, setMatchedPairs] = useState([]);
    const [moves, setMoves] = useState(0);
    const [timer, setTimer] = useState(0);
    const [gameComplete, setGameComplete] = useState(false);
    const [gameActive, setGameActive] = useState(false);
    const [earnedDollars, setEarnedDollars] = useState(0);
    const [score, setScore] = useState(0);

    const navigate = useNavigate();
    const location = useLocation();

    const setupCards = (words) => {
        const gameCards = [];
        words.forEach(word => {
            gameCards.push({
                id: `en-${word.id}`,
                wordId: word.id,
                content: word.english,
                type: 'english',
                isFlipped: false,
                isMatched: false
            });
            gameCards.push({
                id: `ko-${word.id}`,
                wordId: word.id,
                content: word.korean,
                type: 'korean',
                isFlipped: false,
                isMatched: false
            });
        });

        for (let i = gameCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [gameCards[i], gameCards[j]] = [gameCards[j], gameCards[i]];
        }

        setCards(gameCards);
        setFlippedCards([]);
        setMatchedPairs([]);
        setMoves(0);
        setTimer(0);
        setGameComplete(false);
        setEarnedDollars(0);
        setScore(0);
    };

    // Fetch words and setup game
    useEffect(() => {
        const initializeGame = async () => {
            const { studyStartIndex, studyEndIndex, bookName } = location.state || {};

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

                // If too many words, maybe limit? But usually study set is small (20-30).
                // Card game might be hard with too many.

                setupCards(targetWords);
                setLoading(false);
                setGameActive(true);

            } catch (err) {
                console.error(err);
                alert('게임 로딩 실패: ' + err.message);
                navigate('/student');
            }
        };

        initializeGame();
    }, [location.state, navigate]);

    // Timer
    useEffect(() => {
        let interval;
        if (gameActive && !gameComplete) {
            interval = setInterval(() => {
                setTimer(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [gameActive, gameComplete]);

    const handleCardClick = (index) => {
        if (gameComplete || !gameActive) return;
        if (cards[index].isFlipped || cards[index].isMatched) return;
        if (flippedCards.length >= 2) return;

        const newCards = [...cards];
        newCards[index].isFlipped = true;
        setCards(newCards);

        const newFlipped = [...flippedCards, { index, ...newCards[index] }];
        setFlippedCards(newFlipped);

        if (newFlipped.length === 2) {
            setMoves(prev => prev + 1);
            checkMatch(newFlipped, newCards);
        }
    };

    const checkMatch = async (flipped, currentCards) => {
        const [card1, card2] = flipped;
        const isMatch = card1.wordId === card2.wordId;

        if (isMatch) {
            const newMatched = [...matchedPairs, card1.wordId];
            setMatchedPairs(newMatched);

            const newCards = currentCards.map(card => {
                if (card.wordId === card1.wordId) {
                    return { ...card, isMatched: true };
                }
                return card;
            });

            setCards(newCards);
            setFlippedCards([]);

            // Mini confetti for match
            confetti({
                particleCount: 30,
                spread: 50,
                origin: { y: 0.7 },
                colors: ['#60A5FA', '#34D399']
            });

            if (newMatched.length === (cards.length / 2)) {
                setGameComplete(true);

                // Calculate Score: Max 100. Deduct for extra moves and time.
                // Ideal moves = pairs.
                const pairs = cards.length / 2;
                // current 'moves' state is not updated yet in this render cycle, so use moves + 1
                const finalMoves = moves + 1;

                // Formula: 100 - (Extra Moves * 5) - (Time / 2)
                const extraMoves = Math.max(0, finalMoves - pairs);
                const calculatedScore = Math.max(0, Math.round(100 - (extraMoves * 5) - (timer / 2)));
                setScore(calculatedScore);

                // Check for reward
                const settings = await getRewardSettings();
                if (calculatedScore >= settings.game_high_score_threshold) {
                    const userId = localStorage.getItem('userId');
                    if (userId) {
                        const dailyEarnings = await getDailyGameEarnings(userId);
                        const remainingLimit = (settings.game_daily_max_reward || 0.5) - dailyEarnings;

                        if (remainingLimit > 0) {
                            const rewardAmount = Math.min(settings.game_high_score_reward, remainingLimit);
                            if (rewardAmount > 0) {
                                await addDollars(userId, rewardAmount, `카드 뒤집기 게임 고득점 (${calculatedScore}점)`, 'game_reward');
                                setEarnedDollars(rewardAmount);
                            }
                        }
                    }
                }

                triggerWinConfetti();
            }
        } else {
            setTimeout(() => {
                const resetCards = currentCards.map((card, i) => {
                    if (i === card1.index || i === card2.index) {
                        return { ...card, isFlipped: false };
                    }
                    return card;
                });
                setCards(resetCards);
                setFlippedCards([]);
            }, 1000);
        }
    };

    const triggerWinConfetti = useCallback(() => {
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
        const resetCards = cards.map(c => ({
            ...c,
            isFlipped: false,
            isMatched: false
        }));

        for (let i = resetCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [resetCards[i], resetCards[j]] = [resetCards[j], resetCards[i]];
        }

        setCards(resetCards);
        setFlippedCards([]);
        setMatchedPairs([]);
        setMoves(0);
        setTimer(0);
        setGameComplete(false);
        setGameActive(true);
        setEarnedDollars(0);
        setScore(0);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-indigo-900 text-white">로딩 중...</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 p-4 md:p-8 font-sans overflow-hidden relative">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-10 left-10 w-32 h-32 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
                <div className="absolute top-10 right-10 w-32 h-32 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-20 w-32 h-32 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
            </div>

            <div className="max-w-4xl mx-auto relative z-10">
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
                        <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md px-5 py-2 rounded-full border border-white/20 shadow-lg">
                            <Move className="w-4 h-4 text-blue-300" />
                            <span className="text-blue-100 text-sm">이동</span>
                            <span className="font-bold text-white text-lg">{moves}</span>
                        </div>
                        <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md px-5 py-2 rounded-full border border-white/20 shadow-lg">
                            <Timer className="w-4 h-4 text-yellow-300" />
                            <span className="font-bold text-white text-lg">{formatTime(timer)}</span>
                        </div>
                    </div>
                </div>

                {/* Game Board */}
                <div className="grid grid-cols-4 md:grid-cols-5 gap-3 md:gap-4 perspective-1000">
                    {cards.map((card, index) => (
                        <div
                            key={`${card.id}-${index}`}
                            onClick={() => handleCardClick(index)}
                            className={`
                                aspect-[3/4] relative cursor-pointer transition-all duration-500 transform
                                ${card.isMatched ? 'opacity-0 scale-0 pointer-events-none' : 'opacity-100 scale-100 hover:-translate-y-2'}
                            `}
                        >
                            <div className={`
                                w-full h-full transition-all duration-500 transform preserve-3d shadow-xl rounded-xl
                                ${card.isFlipped ? 'rotate-y-180' : ''}
                            `}>
                                {/* Front (Hidden State - Back of Card) */}
                                <div className="absolute w-full h-full backface-hidden bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center border border-white/20 shadow-inner group">
                                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <span className="text-white font-bold text-lg">?</span>
                                    </div>
                                </div>

                                {/* Back (Shown State - Content) */}
                                <div className={`
                                    absolute w-full h-full backface-hidden bg-white rounded-xl flex items-center justify-center border-2 
                                    ${card.type === 'english' ? 'border-blue-400' : 'border-green-400'}
                                    rotate-y-180 shadow-2xl
                                `}>
                                    <span className={`font-bold text-center p-2 text-gray-800 ${card.type === 'english' ? 'text-lg' : 'text-base'}`}>
                                        {card.content}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Game Over Modal */}
                {gameComplete && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl transform scale-100 animate-bounce-in">
                            <div className="relative">
                                <div className="absolute inset-0 bg-yellow-400 blur-xl opacity-20 rounded-full"></div>
                                <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-4 relative z-10 animate-bounce" />
                            </div>
                            <h2 className="text-3xl font-bold text-white mb-2">스테이지 클리어!</h2>
                            <p className="text-indigo-200 mb-4">
                                <span className="font-bold text-white">{moves}</span>번의 이동으로<br />
                                <span className="font-bold text-white">{formatTime(timer)}</span>만에 완료했습니다!
                            </p>

                            <div className="mb-6">
                                <p className="text-sm text-indigo-300">획득 점수</p>
                                <p className="text-4xl font-black text-white drop-shadow-lg">{score}점</p>
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

                            <div className="space-y-3">
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
                    </div>
                )}
            </div>

            <style>{`
                .perspective-1000 { perspective: 1000px; }
                .preserve-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
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
                .animate-fade-in {
                    animation: fadeIn 0.3s ease-out;
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
