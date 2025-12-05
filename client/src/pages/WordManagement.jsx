import React, { useState, useEffect, useCallback } from 'react';
import { Upload, Trash2, Plus, BookOpen, Edit2, Save, X, AlertTriangle, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabase';

export default function WordManagement() {
    const [words, setWords] = useState([]);
    const [newWord, setNewWord] = useState({ book_name: '기본', word_number: '', english: '', korean: '' });
    const [filterBookName, setFilterBookName] = useState('기본');
    const [editingWord, setEditingWord] = useState(null);

    const fetchWords = useCallback(async () => {
        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';
            // Filter words by academyId
            const { data, error } = await supabase
                .from('words')
                .select('*, english:word, korean:meaning')
                .eq('academy_id', academyId);

            if (error) throw error;

            // Sort by book_name first, then word_number
            data.sort((a, b) => {
                const bookA = (a.book_name || '').toString();
                const bookB = (b.book_name || '').toString();
                if (bookA < bookB) return -1;
                if (bookA > bookB) return 1;
                return (a.word_number || 0) - (b.word_number || 0);
            });
            setWords(data);
        } catch (err) {
            console.error("Error fetching words:", err);
        }
    }, []);

    useEffect(() => {
        fetchWords();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const bookNames = ['전체', '기본', ...new Set(words.map(w => w.book_name).filter(n => n && n !== '기본'))];

    const handleExcelUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            const formattedWords = jsonData.map(row => ({
                book_name: row.단어장명 || row.book_name || '기본',
                word_number: row.번호 || row.word_number ? parseInt(row.번호 || row.word_number) : null,
                english: row.영단어 || row.english || row.영어 || row.word || '',
                korean: row.뜻 || row.korean || row.한글 || row.meaning || ''
            })).filter(w => w.english && w.korean);

            console.log('Formatted words:', formattedWords);
            uploadWords(formattedWords);
        };
        reader.readAsArrayBuffer(file);
        e.target.value = '';
    };

    const uploadWords = async (wordsToUpload) => {
        try {
            console.log('Uploading words:', wordsToUpload);
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            const wordsWithAcademy = wordsToUpload.map(w => ({
                book_name: w.book_name,
                academy_id: academyId,
                word: w.english,
                meaning: w.korean,
                word_number: w.word_number
            }));

            // Supabase bulk insert
            // Chunking is still good for large datasets (e.g. 5000+)
            const batchSize = 1000;
            for (let i = 0; i < wordsWithAcademy.length; i += batchSize) {
                const chunk = wordsWithAcademy.slice(i, i + batchSize);
                const { error } = await supabase.from('words').insert(chunk);
                if (error) throw error;
            }

            // Update books collection counts
            // In Supabase, we should upsert into the 'books' table
            const bookCounts = {};
            wordsToUpload.forEach(word => {
                const bookName = word.book_name || '기본';
                bookCounts[bookName] = (bookCounts[bookName] || 0) + 1;
            });

            // We need to fetch existing counts or just recalculate all counts for these books?
            // Actually 'increment' is hard with upsert unless we use RPC.
            // Simpler strategy: regenerate counts for these books.
            // Or better: Use the 'generateBooksCollection' logic properly.
            // For now, let's just Upsert the existence of the book, and maybe update count if we can.
            // BUT, calculating total count is better done by aggregation.
            // Let's rely on 'generateBooksCollection' or doing a quick count update.
            // I'll reuse the logic from generateBooksCollection to update counts for affected books.

            for (const bookName of Object.keys(bookCounts)) {
                // Get current count from words table (safest)
                const { count, error: countError } = await supabase
                    .from('words')
                    .select('*', { count: 'exact', head: true })
                    .eq('academy_id', academyId)
                    .eq('book_name', bookName);

                if (!countError) {
                    const { error: upsertError } = await supabase
                        .from('books')
                        .upsert({
                            academy_id: academyId,
                            name: bookName,
                            total_words: count
                        }, { onConflict: 'academy_id, name' });
                }
            }

            alert(`${wordsToUpload.length}개의 단어가 추가되었습니다!`);
            fetchWords();
        } catch (err) {
            console.error('Upload error:', err);
            alert('업로드 실패: ' + err.message);
        }
    };

    const handleAddWord = async (e) => {
        e.preventDefault();
        if (!newWord.english || !newWord.korean) return;

        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';
            const { error } = await supabase.from('words').insert({
                book_name: newWord.book_name,
                academy_id: academyId,
                word: newWord.english,
                meaning: newWord.korean,
                word_number: newWord.word_number ? parseInt(newWord.word_number) : null
            });

            if (error) throw error;

            // Update user interface
            setNewWord({ book_name: '기본', word_number: '', english: '', korean: '' });
            fetchWords();

            // Background count update
            const { count } = await supabase
                .from('words')
                .select('*', { count: 'exact', head: true })
                .eq('academy_id', academyId)
                .eq('book_name', newWord.book_name);

            await supabase.from('books').upsert({
                academy_id: academyId,
                name: newWord.book_name,
                total_words: count
            }, { onConflict: 'academy_id, name' });

        } catch (err) {
            console.error("Error adding word:", err);
            alert("단어 추가 실패");
        }
    };

    const handleDeleteWord = async (id) => {
        if (!confirm('이 단어를 삭제하시겠습니까?')) return;

        try {
            // Get word info first to know which book to update
            const { data: word } = await supabase.from('words').select('book_name, academy_id').eq('id', id).single();

            const { error } = await supabase.from('words').delete().eq('id', id);
            if (error) throw error;

            fetchWords();

            if (word) {
                const { count } = await supabase
                    .from('words')
                    .select('*', { count: 'exact', head: true })
                    .eq('academy_id', word.academy_id)
                    .eq('book_name', word.book_name);

                await supabase.from('books').upsert({
                    academy_id: word.academy_id,
                    name: word.book_name,
                    total_words: count
                }, { onConflict: 'academy_id, name' });
            }

        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    };

    const handleUpdateWord = async () => {
        if (!editingWord) return;
        try {
            const { error } = await supabase
                .from('words')
                .update({
                    book_name: editingWord.book_name,
                    word_number: editingWord.word_number ? parseInt(editingWord.word_number) : null,
                    word: editingWord.english,
                    meaning: editingWord.korean
                })
                .eq('id', editingWord.id);

            if (error) throw error;

            setEditingWord(null);
            fetchWords();
        } catch (err) {
            console.error("Error updating word:", err);
            alert("수정 실패");
        }
    };

    const handleDeleteBook = async () => {
        if (filterBookName === '전체') {
            alert('삭제할 단어장을 선택해주세요.');
            return;
        }

        if (!confirm(`'${filterBookName}' 단어장의 모든 단어를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            // Delete all words in the book
            const { error } = await supabase
                .from('words')
                .delete()
                .eq('academy_id', academyId)
                .eq('book_name', filterBookName);

            if (error) throw error;

            // Delete book metadata
            await supabase
                .from('books')
                .delete()
                .eq('academy_id', academyId)
                .eq('name', filterBookName);

            alert(`'${filterBookName}' 단어장이 삭제되었습니다.`);
            setFilterBookName('전체');
            fetchWords();
        } catch (err) {
            console.error("Error deleting book:", err);
            alert("단어장 삭제 실패");
        }
    };

    const downloadTemplate = () => {
        const template = [
            { 단어장명: '기본', 번호: 1, 영단어: 'apple', 뜻: '사과' },
            { 단어장명: '기본', 번호: 2, 영단어: 'banana', 뜻: '바나나' },
        ];
        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '단어장');
        XLSX.writeFile(wb, '단어장_템플릿.xlsx');
    };

    const generateBooksCollection = async () => {
        if (!confirm('기존 단어 데이터를 기반으로 단어장 목록을 생성하시겠습니까?\n\n이 작업은 words 테이블의 모든 단어를 스캔하여 books 테이블을 생성/업데이트합니다.')) {
            return;
        }

        try {
            const academyId = localStorage.getItem('academyId') || 'academy_default';

            // Fetch all unique book names and their counts using client-side aggregation
            // (Note: Supabase doesn't support GROUP BY with COUNT easily in REST without creating a view/RPC)
            const { data: wordsData, error } = await supabase
                .from('words')
                .select('book_name')
                .eq('academy_id', academyId);

            if (error) throw error;

            const bookCounts = {};
            wordsData.forEach(w => {
                const bookName = w.book_name || '기본';
                bookCounts[bookName] = (bookCounts[bookName] || 0) + 1;
            });

            // Upsert books
            const updates = Object.entries(bookCounts).map(([name, count]) => ({
                academy_id: academyId,
                name: name,
                total_words: count,
                // updated_at will be set by default or trigger, or we can set it
            }));

            // Supabase allows bulk upsert
            if (updates.length > 0) {
                const { error: upsertError } = await supabase
                    .from('books')
                    .upsert(updates, { onConflict: 'academy_id, name' });
                if (upsertError) throw upsertError;
            }

            alert(`✅ 단어장 목록 생성 완료!\n\n총 ${Object.keys(bookCounts).length}개의 단어장이 생성되었습니다:\n${Object.entries(bookCounts).map(([name, count]) => `- ${name}: ${count}단어`).join('\n')}`);

        } catch (error) {
            console.error('Error generating books collection:', error);
            alert('단어장 목록 생성 중 오류가 발생했습니다: ' + error.message);
        }
    };

    const filteredWords = filterBookName === '전체' ? words : words.filter(w => w.book_name === filterBookName);

    const handleDownloadExcel = () => {
        if (filteredWords.length === 0) {
            alert('다운로드할 단어가 없습니다.');
            return;
        }

        const dataToExport = filteredWords.map(word => ({
            단어장명: word.book_name,
            번호: word.word_number,
            영단어: word.english,
            뜻: word.korean
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, filterBookName === '전체' ? '전체단어' : filterBookName);

        const fileName = filterBookName === '전체'
            ? `전체단어목록_${new Date().toISOString().slice(0, 10)}.xlsx`
            : `${filterBookName}_단어목록_${new Date().toISOString().slice(0, 10)}.xlsx`;

        XLSX.writeFile(wb, fileName);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <header className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="p-3 bg-indigo-600 rounded-lg">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold text-gray-900">단어 관리</h1>
                    </div>
                </header>

                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4">엑셀 파일 업로드</h2>
                    <div className="flex items-center space-x-4 mb-4">
                        <label className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-xl cursor-pointer hover:bg-indigo-700 transition-all">
                            <Upload className="w-5 h-5 mr-2" />
                            <span>엑셀 파일 선택</span>
                            <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                        </label>
                        <button onClick={downloadTemplate} className="flex items-center px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all">
                            <span>📥 템플릿 다운로드</span>
                        </button>
                        <button onClick={generateBooksCollection} className="flex items-center px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all">
                            <BookOpen className="w-5 h-5 mr-2" />
                            <span>단어장 목록 생성</span>
                        </button>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-800 font-medium mb-2">📋 엑셀 파일 형식 안내</p>
                        <div className="text-sm text-blue-700 space-y-1">
                            <p>• 첫 행(헤더): <code className="bg-blue-100 px-2 py-0.5 rounded">단어장명 | 번호 | 영단어 | 뜻</code></p>
                            <p>• 예시: <code className="bg-blue-100 px-2 py-0.5 rounded">기본 | 1 | apple | 사과</code></p>
                            <p>• 단어장명이 없으면 '기본'으로 자동 설정됩니다.</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4">단어 직접 추가</h2>
                    <form onSubmit={handleAddWord} className="grid grid-cols-4 gap-4">
                        <input type="text" placeholder="단어장명 (예: 기본)" value={newWord.book_name} onChange={(e) => setNewWord({ ...newWord, book_name: e.target.value })} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <input type="number" placeholder="번호 (선택)" value={newWord.word_number} onChange={(e) => setNewWord({ ...newWord, word_number: e.target.value })} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <input type="text" placeholder="영단어" value={newWord.english} onChange={(e) => setNewWord({ ...newWord, english: e.target.value })} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <input type="text" placeholder="뜻" value={newWord.korean} onChange={(e) => setNewWord({ ...newWord, korean: e.target.value })} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <button type="submit" className="col-span-4 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-all flex items-center justify-center space-x-2">
                            <Plus className="w-5 h-5" />
                            <span>추가</span>
                        </button>
                    </form>
                </div>

                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">등록된 단어 ({filteredWords.length}개)</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={handleDownloadExcel}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-bold"
                            >
                                <Download className="w-4 h-4" />
                                엑셀 다운로드
                            </button>
                            {filterBookName !== '전체' && (
                                <button
                                    onClick={handleDeleteBook}
                                    className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors flex items-center gap-2 text-sm font-bold"
                                >
                                    <AlertTriangle className="w-4 h-4" />
                                    '{filterBookName}' 단어장 전체 삭제
                                </button>
                            )}
                            <select value={filterBookName} onChange={(e) => setFilterBookName(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none">
                                {bookNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-gray-500">
                                    <th className="pb-3 font-medium">단어장명</th>
                                    <th className="pb-3 font-medium w-20">번호</th>
                                    <th className="pb-3 font-medium">영단어</th>
                                    <th className="pb-3 font-medium">뜻</th>
                                    <th className="pb-3 font-medium w-32 text-center">작업</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredWords.map((word) => (
                                    <tr key={word.id} className="hover:bg-gray-50">
                                        {editingWord && editingWord.id === word.id ? (
                                            <>
                                                <td className="py-2">
                                                    <input
                                                        type="text"
                                                        value={editingWord.book_name}
                                                        onChange={(e) => setEditingWord({ ...editingWord, book_name: e.target.value })}
                                                        className="w-full px-2 py-1 border rounded"
                                                    />
                                                </td>
                                                <td className="py-2">
                                                    <input
                                                        type="number"
                                                        value={editingWord.word_number || ''}
                                                        onChange={(e) => setEditingWord({ ...editingWord, word_number: e.target.value })}
                                                        className="w-full px-2 py-1 border rounded"
                                                    />
                                                </td>
                                                <td className="py-2">
                                                    <input
                                                        type="text"
                                                        value={editingWord.english}
                                                        onChange={(e) => setEditingWord({ ...editingWord, english: e.target.value })}
                                                        className="w-full px-2 py-1 border rounded"
                                                    />
                                                </td>
                                                <td className="py-2">
                                                    <input
                                                        type="text"
                                                        value={editingWord.korean}
                                                        onChange={(e) => setEditingWord({ ...editingWord, korean: e.target.value })}
                                                        className="w-full px-2 py-1 border rounded"
                                                    />
                                                </td>
                                                <td className="py-2 flex justify-center gap-2">
                                                    <button onClick={handleUpdateWord} className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setEditingWord(null)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="py-3 text-gray-600">{word.book_name || '기본'}</td>
                                                <td className="py-3 text-gray-500">{word.word_number || '-'}</td>
                                                <td className="py-3 font-medium text-gray-900">{word.english}</td>
                                                <td className="py-3 text-gray-600">{word.korean}</td>
                                                <td className="py-3 flex justify-center gap-2">
                                                    <button onClick={() => setEditingWord(word)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDeleteWord(word.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredWords.length === 0 && (
                            <p className="text-center text-gray-400 py-8">등록된 단어가 없습니다.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
