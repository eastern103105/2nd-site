import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Check, RotateCcw, BookOpen, Trophy, DollarSign } from 'lucide-react';
import { supabase } from '../supabase';
import confetti from 'canvas-confetti';
import { addDollars, getRewardSettings, hasReceivedDailyReward } from '../utils/dollarUtils';
import { addTestToSummary } from '../utils/dailySummary';

const isSentence = (text) => text && text.trim().split(/\s+/).length >= 3;

const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

export default function TestInterface() {
    const [loading, setLoading] = useState(true);
    const [newWords, setNewWords] = useState([]);
    const [reviewWords, setReviewWords] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [testMode, setTestMode] = useState('new');
    const [retryMode, setRetryMode] = useState(false);
    const [currentTestWords, setCurrentTestWords] = useState([]);
    const [answers, setAnswers] = useState({});
    const [wrongWords, setWrongWords] = useState([]);
    const [showWrongWordsReview, setShowWrongWordsReview] = useState(false);
    const [rangeStart, setRangeStart] = useState(0);
    const [rangeEnd, setRangeEnd] = useState(0);
    const [allTestsComplete, setAllTestsComplete] = useState(false);
    const [firstAttemptScore, setFirstAttemptScore] = useState(null);
    const [retryCount, setRetryCount] = useState(0);
    const [initialTestType, setInitialTestType] = useState('new_words');
    const [maxWordNumber, setMaxWordNumber] = useState(0);
    const [currentBookName, setCurrentBookName] = useState('');
    const [earnedDollars, setEarnedDollars] = useState(0);

    const navigate = useNavigate();
    const location = useLocation();

    const [scrambledWords, setScrambledWords] = useState([]);
    const [selectedWords, setSelectedWords] = useState([]);
    const [currentInput, setCurrentInput] = useState('');

    // Refs for preventing double submission and accumulating answers
    const isSubmitting = React.useRef(false);
    const sessionAnswersRef = React.useRef({});

    useEffect(() => {
        const fetchTest = async () => {
            const userId = localStorage.getItem('userId');
            let studyStartIndex = localStorage.getItem('studyStartIndex');
            let studyEndIndex = localStorage.getItem('studyEndIndex');

            // Check location state for range overrides
            if (location.state?.studyStartIndex !== undefined && location.state?.studyEndIndex !== undefined) {
                studyStartIndex = location.state.studyStartIndex;
                studyEndIndex = location.state.studyEndIndex;
            }

            try {
                // 1. Get User Settings
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (userError || !userData) {
                    alert('사용자 설정을 찾을 수 없습니다.');
                    navigate('/student');
                    return;
                }

                const settings = userData;
                const bookName = location.state?.bookName || settings.book_name || '기본';
                setCurrentBookName(bookName);

                let currentWordIndex = 0;
                if (settings.book_progress && settings.book_progress[bookName] !== undefined) {
                    currentWordIndex = settings.book_progress[bookName];
                } else if (bookName === settings.book_name) {
                    currentWordIndex = settings.current_word_index || 0;
                }

                // 2. Determine Range
                let startWordNumber;
                let endWordNumber;

                if (studyStartIndex != null && studyEndIndex != null) {
                    startWordNumber = parseInt(studyStartIndex);
                    endWordNumber = parseInt(studyEndIndex);
                    console.log('Using stored range:', startWordNumber, endWordNumber);
                } else {
                    startWordNumber = currentWordIndex + 1;

                    const today = new Date().getDay().toString();
                    const dailyCounts = settings.words_per_day || {};

                    const bookSettings = settings.book_settings?.[bookName] || {};
                    const bookWordsPerSession = bookSettings.words_per_session ? parseInt(bookSettings.words_per_session) : null;

                    let wordsPerSession;
                    if (bookWordsPerSession) {
                        wordsPerSession = bookWordsPerSession;
                    } else if (dailyCounts[today]) {
                        wordsPerSession = parseInt(dailyCounts[today]);
                    } else {
                        wordsPerSession = settings.words_per_session || 10;
                    }

                    endWordNumber = startWordNumber + wordsPerSession;
                    console.log('Using calculated range (Today):', startWordNumber, endWordNumber);
                }

                // Review Range
                const currentSessionLength = endWordNumber - startWordNumber;
                const reviewStartWordNumber = Math.max(1, startWordNumber - (currentSessionLength * 2));
                const reviewEndWordNumber = startWordNumber;

                // 3. Fetch Words (Optimized: Split queries)

                // Fetch New Words
                let newWordsData = [];
                try {
                    const { data, error } = await supabase
                        .from('words')
                        .select('*')
                        .eq('book_name', bookName)
                        .gte('word_number', startWordNumber)
                        .lt('word_number', endWordNumber)
                        .order('word_number', { ascending: true });

                    if (error) throw error;
                    newWordsData = data || [];
                } catch (queryError) {
                    console.warn("New words query failed:", queryError);
                }

                // Fetch Review Words
                let reviewWordsData = [];
                try {
                    const { data, error } = await supabase
                        .from('words')
                        .select('*')
                        .eq('book_name', bookName)
                        .gte('word_number', reviewStartWordNumber)
                        .lt('word_number', reviewEndWordNumber)
                        .order('word_number', { ascending: true });

                    if (error) throw error;
                    reviewWordsData = data || [];
                } catch (queryError) {
                    console.warn("Review words query failed:", queryError);
                }

                // Fetch Max Word Number
                let maxNum = 0;
                try {
                    const { data, error } = await supabase
                        .from('words')
                        .select('word_number')
                        .eq('book_name', bookName)
                        .order('word_number', { ascending: false })
                        .limit(1)
                        .single();

                    if (data) {
                        maxNum = data.word_number;
                    }
                } catch (queryError) {
                    console.warn("Max word query failed:", queryError);
                }
                setMaxWordNumber(maxNum);

                const allWordsCount = newWordsData.length + reviewWordsData.length;

                if (newWordsData.length === 0 && allWordsCount === 0) {
                    alert('학습할 단어가 없습니다.');
                    navigate('/student');
                    return;
                }

                // Ensure review words do not overlap with new words
                const newWordIds = new Set(newWordsData.map(w => w.id));
                const filteredReviewWords = reviewWordsData.filter(w => !newWordIds.has(w.id));

                setNewWords(newWordsData);
                setReviewWords(filteredReviewWords);

                setRangeStart(startWordNumber);
                setRangeEnd(endWordNumber);

                // Determine initial test type
                let mode = 'word_typing'; // Default
                if (bookName === '기본') {
                    mode = 'word_typing';
                } else if (settings.book_settings?.[bookName]?.test_mode) {
                    mode = settings.book_settings[bookName].test_mode;
                }

                if (newWordsData.length > 0) {
                    setInitialTestType('new_words');
                    setCurrentTestWords(shuffleArray(newWordsData));
                    setTestMode(mode === 'sentence_click' ? 'sentence_click' : (mode === 'sentence_type' ? 'sentence_type' : 'new'));
                } else if (reviewWordsData.length > 0) {
                    setInitialTestType('review_words');
                    setShowWrongWordsReview(true);
                    setWrongWords(reviewWordsData);
                    setTestMode('review-study');
                } else {
                    alert('학습할 단어가 없습니다.');
                    navigate('/student');
                }

            } catch (err) {
                console.error(err);
                alert('데이터 불러오기 실패');
                navigate('/student');
            } finally {
                setLoading(false);
            }
        };

        fetchTest();
    }, [location.state, navigate]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
                e.preventDefault();
                alert('단축키를 사용할 수 없습니다.');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        const word = currentTestWords[currentIndex];
        if (word && (testMode === 'sentence_click' || testMode === 'sentence_type') && isSentence(word.english)) {
            const words = word.english.trim().split(/\s+/);
            const shuffled = [...words].map((w, i) => ({ text: w, id: i }));
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            setScrambledWords(shuffled);
            setSelectedWords([]);
        } else {
            setScrambledWords([]);
            setSelectedWords([]);
        }
    }, [currentIndex, currentTestWords, testMode]);

    const handleSentenceClick = (wordObj) => {
        setScrambledWords(prev => prev.filter(w => w.id !== wordObj.id));
        setSelectedWords(prev => [...prev, wordObj]);
    };

    const handleSentenceUndo = (wordObj) => {
        setSelectedWords(prev => prev.filter(w => w.id !== wordObj.id));
        setScrambledWords(prev => [...prev, wordObj]);
    };

    const submitSentence = () => {
        const answer = selectedWords.map(w => w.text).join(' ');
        handleAnswer(answer);
    };

    const speakWord = (text) => {
        if (!window.speechSynthesis) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        window.speechSynthesis.speak(utter);
    };

    const handleAnswer = (answer) => {
        if (isSubmitting.current || allTestsComplete) return;

        const currentWord = currentTestWords[currentIndex];
        const correctAnswer = testMode === 'review' ? currentWord.korean : currentWord.english;

        const normalizedAnswer = answer.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
        const normalizedCorrect = correctAnswer.trim().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

        const isCorrect = normalizedAnswer === normalizedCorrect;
        const newAnswer = { correct: isCorrect, userAnswer: answer, word: currentWord };

        setAnswers((prev) => {
            const updatedAnswers = { ...prev, [currentWord.id]: newAnswer };
            if (currentIndex >= currentTestWords.length - 1) {
                setTimeout(() => {
                    finishCurrentTestWithAnswers(updatedAnswers);
                }, 0);
            }
            return updatedAnswers;
        });

        if (currentIndex < currentTestWords.length - 1) {
            setCurrentIndex((prev) => prev + 1);
        }
    };

    const finishCurrentTestWithAnswers = (finalAnswers) => {
        const wrong = currentTestWords.filter((word) => !finalAnswers[word.id]?.correct);

        const totalWords = currentTestWords.length;
        const correctCount = Object.values(finalAnswers).filter((a) => a.correct).length;
        const attemptScore = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

        if (firstAttemptScore === null && !retryMode) {
            setFirstAttemptScore(attemptScore);
        }

        if (wrong.length > 0) {
            setWrongWords(wrong);
            setShowWrongWordsReview(true);
            sessionAnswersRef.current = { ...sessionAnswersRef.current, ...finalAnswers };
        } else {
            moveToNextPhase(finalAnswers);
        }
    };

    const startRetry = () => {
        setShowWrongWordsReview(false);
        setRetryCount(prev => prev + 1);
        if (testMode === 'review-study') {
            setTestMode('review');
            setCurrentTestWords(shuffleArray(reviewWords));
            setCurrentIndex(0);
            setAnswers({});
            setRetryMode(false);
        } else {
            setRetryMode(true);
            setCurrentTestWords(shuffleArray(wrongWords));
            setCurrentIndex(0);
            setAnswers({});
        }
    };

    const moveToNextPhase = (currentPhaseAnswers = {}) => {
        sessionAnswersRef.current = { ...sessionAnswersRef.current, ...currentPhaseAnswers };

        if ((testMode === 'new' || testMode === 'word_typing' || testMode === 'sentence_click' || testMode === 'sentence_type') && !retryMode) {
            if (reviewWords.length > 0) {
                setShowWrongWordsReview(true);
                setWrongWords(reviewWords);
                setTestMode('review-study');
                setAnswers({});
            } else {
                submitAndFinish();
            }
        } else if (testMode === 'review' && !retryMode) {
            submitAndFinish();
        } else if (retryMode) {
            setRetryMode(false);
            if (testMode === 'new' || testMode === 'word_typing' || testMode === 'sentence_click' || testMode === 'sentence_type') {
                if (reviewWords.length > 0) {
                    setShowWrongWordsReview(true);
                    setWrongWords(reviewWords);
                    setTestMode('review-study');
                    setAnswers({});
                } else {
                    submitAndFinish();
                }
            } else if (testMode === 'review') {
                submitAndFinish();
            }
        }
    };

    const submitAndFinish = async () => {
        if (isSubmitting.current) return;
        isSubmitting.current = true;

        const finalAllAnswers = sessionAnswersRef.current;
        const allAnswersValues = Object.values(finalAllAnswers);
        const correctCount = allAnswersValues.filter((a) => a.correct).length;

        const uniqueWordIds = new Set([...newWords.map(w => w.id), ...reviewWords.map(w => w.id)]);
        const totalWords = uniqueWordIds.size;

        const score = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;

        const newWordIds = new Set(newWords.map(w => w.id));
        const reviewWordIds = new Set(reviewWords.map(w => w.id));

        let newCorrect = 0;
        let newTotal = 0;
        let reviewCorrect = 0;
        let reviewTotal = 0;

        allAnswersValues.forEach(ans => {
            if (newWordIds.has(ans.word.id)) {
                newTotal++;
                if (ans.correct) newCorrect++;
            } else if (reviewWordIds.has(ans.word.id)) {
                reviewTotal++;
                if (ans.correct) reviewCorrect++;
            }
        });

        const newWordsScore = newTotal > 0 ? Math.round((newCorrect / newTotal) * 100) : 0;
        const reviewWordsScore = reviewTotal > 0 ? Math.round((reviewCorrect / reviewTotal) * 100) : 0;

        const userId = localStorage.getItem('userId');
        let totalEarned = 0;

        try {
            const today = new Date().toISOString().split('T')[0];
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            await addTestToSummary(userId, {
                date: today,
                score: score,
                correct: correctCount,
                total: totalWords,
                book_name: currentBookName,
                test_mode: testMode,
                range_start: rangeStart,
                range_end: rangeEnd,
                academyId: academyId,
                timestamp: new Date().toISOString(),
                new_words_score: newWordsScore,
                new_words_total: newTotal,
                new_words_correct: newCorrect,
                review_words_score: reviewWordsScore,
                review_words_total: reviewTotal,
                review_words_correct: reviewCorrect,
                first_attempt_score: firstAttemptScore || score,
                retry_count: retryCount,
                test_type: initialTestType,
                scheduled_date: location.state?.scheduledDate || null
            });

            console.log(`✅ Test result saved to daily summary: ${score}점`);

            const rewardSettings = await getRewardSettings();

            const { data: userData, error: userError } = await supabase.from('users').select('*').eq('id', userId).single();

            if (userData) {
                // 1. Daily Completion Reward
                if (location.state?.scheduledDate) {
                    const scheduledDate = new Date(location.state.scheduledDate);
                    const todayDate = new Date();

                    const isToday = scheduledDate.toDateString() === todayDate.toDateString();
                    const dayOfWeek = scheduledDate.getDay();

                    const studyDays = (userData.study_days || '1,2,3,4,5').split(',').map(Number);
                    const isStudyDay = studyDays.includes(dayOfWeek);

                    const alreadyReceived = await hasReceivedDailyReward(userId);

                    if (isToday && isStudyDay && !alreadyReceived) {
                        await addDollars(userId, rewardSettings.daily_completion_reward, '매일 학습 완료');
                        totalEarned += rewardSettings.daily_completion_reward;
                    }
                }

                const currentBookProgress = userData.book_progress || {};
                const currentProgress = currentBookProgress[currentBookName] || 0;

                let newProgress = currentProgress;
                if (rangeStart === currentProgress + 1 || currentProgress === 0) {
                    newProgress = rangeEnd;
                } else if (rangeStart <= currentProgress + 1) {
                    newProgress = Math.max(currentProgress, rangeEnd);
                }

                const updates = {
                    book_progress: { ...currentBookProgress, [currentBookName]: newProgress }
                };

                if (currentBookName === userData.book_name) {
                    updates.current_word_index = newProgress;
                }

                // Check if book finished
                if (newProgress >= maxWordNumber && maxWordNumber > 0) {
                    const activeBooks = userData.active_books || [userData.book_name];
                    const nextBooks = userData.next_books || [];

                    // Curriculum Completion Reward
                    await addDollars(userId, rewardSettings.curriculum_completion_reward, `'${currentBookName}' 완독`);
                    totalEarned += rewardSettings.curriculum_completion_reward;

                    if (activeBooks.includes(currentBookName)) {
                        const newActiveBooks = activeBooks.filter(b => b !== currentBookName);

                        if (nextBooks.length > 0) {
                            const nextBook = nextBooks[0];
                            newActiveBooks.push(nextBook);
                            updates.next_books = nextBooks.slice(1);
                            alert(`'${currentBookName}' 단어장을 완료했습니다! 다음 단어장 '${nextBook}'이(가) 시작됩니다.`);
                        } else {
                            alert(`'${currentBookName}' 단어장을 완료했습니다!`);
                        }

                        updates.active_books = newActiveBooks;
                        if (newActiveBooks.length > 0) {
                            updates.book_name = newActiveBooks[0];
                        }
                    }
                }

                await supabase.from('users').update(updates).eq('id', userId);
            }

            setEarnedDollars(totalEarned);
            setAllTestsComplete(true);
            triggerConfetti();
        } catch (err) {
            console.error("Error submitting results:", err);
            alert("결과 저장 중 오류가 발생했습니다.");
            isSubmitting.current = false;
        }
    };

    const triggerConfetti = () => {
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

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white">시험지 생성 중...</div>;

    if (allTestsComplete) {
        const uniqueWordIds = new Set([...newWords.map(w => w.id), ...reviewWords.map(w => w.id)]);
        const totalWords = uniqueWordIds.size;
        const finalAllAnswers = sessionAnswersRef.current;
        const correctCount = Object.values(finalAllAnswers).filter((a) => a.correct).length;
        const score = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : 0;
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 p-4 animate-fade-in">
                <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6 transform scale-100 animate-bounce-in">
                    <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/50">
                        <Trophy className="w-10 h-10 text-white animate-bounce" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">모든 학습 완료!</h1>
                    <div className="text-6xl font-black text-yellow-400 drop-shadow-lg">
                        {score}<span className="text-2xl text-indigo-200 font-medium">점</span>
                    </div>

                    {earnedDollars > 0 && (
                        <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 animate-pulse">
                            <p className="text-green-300 font-bold mb-1">획득한 보상</p>
                            <div className="flex items-center justify-center text-3xl font-bold text-green-400">
                                <DollarSign className="w-8 h-8 mr-1" />
                                {earnedDollars.toFixed(2)}
                            </div>
                        </div>
                    )}

                    <p className="text-indigo-200">
                        {totalWords}문제 중 <span className="text-white font-bold">{correctCount}</span>개를 맞췄습니다.
                    </p>
                    <button onClick={() => navigate('/student')} className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg border border-white/20">
                        대시보드로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    if (showWrongWordsReview) {
        const isReviewStudy = testMode === 'review-study';
        const headerBgColor = isReviewStudy ? 'bg-blue-600/20' : 'bg-red-600/20';
        const headerTextColor = isReviewStudy ? 'text-blue-200' : 'text-red-200';
        const cardBgColor = isReviewStudy ? 'bg-blue-500/10' : 'bg-red-500/10';
        const cardBorderColor = isReviewStudy ? 'border-blue-400/30' : 'border-red-400/30';
        const badgeBgColor = isReviewStudy ? 'bg-blue-500/20' : 'bg-red-500/20';
        const badgeTextColor = isReviewStudy ? 'text-blue-300' : 'text-red-300';
        const buttonBgColor = isReviewStudy ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700';

        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 to-indigo-900 p-8 font-sans text-white">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-white/10 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                        <div className={`${headerBgColor} p-6 border-b border-white/10`}>
                            <div className="flex items-center space-x-3">
                                <BookOpen className="w-8 h-8 text-white" />
                                <div>
                                    <h1 className="text-2xl font-bold text-white">
                                        {isReviewStudy ? '복습 단어 학습' : '오답 단어 학습'}
                                    </h1>
                                    <p className={`${headerTextColor} text-sm`}>
                                        {isReviewStudy
                                            ? `${wrongWords.length}개의 복습 단어를 학습하세요`
                                            : `틀린 ${wrongWords.length}개의 단어를 복습하세요`}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                {wrongWords.map((word, index) => (
                                    <div
                                        key={word.id}
                                        className={`p-4 ${cardBgColor} rounded-xl border ${cardBorderColor} cursor-pointer hover:bg-white/5 transition-colors`}
                                        onClick={() => speakWord(word.english)}
                                    >
                                        <div className="flex items-center space-x-2 mb-2">
                                            <span className={`text-xs font-medium ${badgeTextColor} ${badgeBgColor} px-2 py-1 rounded`}>
                                                {isReviewStudy ? `복습 ${index + 1}` : `오답 ${index + 1}`}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-bold text-white mb-1">{word.english}</h3>
                                        <p className="text-gray-300">{word.korean}</p>
                                        {!isReviewStudy && answers[word.id]?.userAnswer && (
                                            <p className="text-sm text-red-400 mt-2">내 답: {answers[word.id].userAnswer}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="border-t border-white/10 pt-6">
                                <button
                                    onClick={startRetry}
                                    className={`w-full py-4 ${buttonBgColor} text-white rounded-xl font-bold text-lg transition-all flex items-center justify-center space-x-2 shadow-lg`}
                                >
                                    {isReviewStudy ? (
                                        <>
                                            <Check className="w-6 h-6" />
                                            <span>학습 완료 - 복습 시험 시작하기</span>
                                        </>
                                    ) : (
                                        <>
                                            <RotateCcw className="w-6 h-6" />
                                            <span>재시험 시작하기</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const currentWord = currentTestWords[currentIndex];
    const totalProgress = currentTestWords.length;
    const currentProgress = currentIndex + 1;

    const getModeLabel = () => {
        if (retryMode) return '오답 재시험';
        if (testMode === 'new' || testMode === 'word_typing') return '단어 시험';
        if (testMode === 'sentence_type') return '문장 시험 (타이핑)';
        if (testMode === 'sentence_click') return '문장 배열 시험';
        return '복습 시험';
    };

    useEffect(() => {
        setCurrentInput('');
    }, [currentIndex]);

    const handleInputSubmit = () => {
        handleAnswer(currentInput);
    };

    return (
        <div
            className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 flex flex-col font-sans text-white overflow-hidden relative"
            onCopy={(e) => e.preventDefault()}
            onPaste={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* Background Particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-20 w-60 h-60 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
                <div className="absolute bottom-20 right-20 w-60 h-60 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
            </div>

            <div className="h-2 bg-white/10 relative z-10">
                <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                    style={{ width: `${(currentProgress / totalProgress) * 100}%` }}
                />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-4 relative z-10">
                <div className="w-full max-w-2xl bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden transform transition-all">
                    <div className={`p-8 text-center text-white ${retryMode ? 'bg-red-600/80' : 'bg-indigo-600/80'} backdrop-blur-md`}>
                        <span className={`text-sm font-medium uppercase tracking-wider ${retryMode ? 'text-red-100' : 'text-indigo-100'}`}>
                            {getModeLabel()} - 문제 {currentProgress} / {totalProgress}
                        </span>
                        <h2 className="mt-4 text-4xl font-bold drop-shadow-md animate-fade-in">
                            {currentWord ? (testMode === 'review' ? currentWord.english : currentWord.korean) : 'Loading...'}
                        </h2>
                        <p className={`mt-2 text-sm ${retryMode ? 'text-red-100' : 'text-indigo-100'}`}>
                            {testMode === 'review' ? '한글 뜻을 선택하세요' : (testMode === 'sentence_click' ? '단어를 순서대로 클릭하세요' : '영어 단어/문장을 입력하세요')}
                        </p>
                    </div>
                    <div className="p-8">
                        {testMode === 'sentence_click' ? (
                            <div className="space-y-6">
                                <div className="min-h-[100px] flex items-center justify-center mb-8">
                                    <div className="flex flex-wrap gap-2 justify-center">
                                        {selectedWords.map((w) => (
                                            <button
                                                key={w.id}
                                                onClick={() => handleSentenceUndo(w)}
                                                className="px-6 py-3 bg-white text-gray-900 rounded-xl font-bold text-lg shadow-lg hover:bg-gray-50 transition-all transform hover:-translate-y-1 border-b-4 border-gray-200"
                                            >
                                                {w.text}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                    {scrambledWords.map((w) => (
                                        <button
                                            key={w.id}
                                            onClick={() => handleSentenceClick(w)}
                                            className="px-4 py-3 bg-white/10 text-white rounded-lg font-medium hover:bg-white/20 border border-white/10 transition-all"
                                        >
                                            {w.text}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-8">
                                    <button
                                        onClick={submitSentence}
                                        className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-bold text-lg shadow-lg hover:from-blue-600 hover:to-cyan-600 transition-all transform hover:-translate-y-1"
                                    >
                                        정답 확인 <ArrowRight className="inline-block ml-2 w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <input
                                    type="text"
                                    value={currentInput}
                                    onChange={(e) => setCurrentInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleInputSubmit();
                                    }}
                                    autoFocus
                                    className="w-full bg-white/10 border border-white/20 text-white text-center text-2xl font-bold rounded-xl py-4 px-6 focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder-white/30"
                                    placeholder={testMode === 'review' ? '한글 뜻 입력' : '영어 단어 입력'}
                                />
                                <button
                                    onClick={handleInputSubmit}
                                    className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold text-lg shadow-lg hover:from-indigo-600 hover:to-purple-600 transition-all transform hover:-translate-y-1"
                                >
                                    정답 확인 <ArrowRight className="inline-block ml-2 w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
// I noticed I missed `currentInput` state in my rewrite.
// I will start the file rewrite again, ensuring I have `currentInput` state and proper input handling.
