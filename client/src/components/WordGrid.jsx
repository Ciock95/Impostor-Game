import React from 'react';

const WordGrid = ({ words, targetIndex, role, phase, onWordClick }) => {
    const isImposter = role === 'IMPOSTOR';
    const isResolution = phase === 'RESOLUTION';
    const canClick = isImposter && isResolution;

    if (!words || words.length === 0) return null;

    return (
        <div className="grid grid-cols-4 gap-4 p-4 w-full max-w-2xl mx-auto">
            {words.map((word, index) => {
                const isTarget = index === targetIndex;

                let cardStyle = "bg-slate-700 text-slate-200 border-slate-600 hover:border-blue-500";

                // Highlight logic
                if (!isImposter && isTarget) {
                    // Innocent sees target
                    cardStyle = "bg-green-600/20 border-green-500 text-green-300 shadow-[0_0_15px_rgba(34,197,94,0.3)] scale-105 z-10 font-bold border-2";
                }

                if (canClick) {
                    cardStyle += " cursor-pointer hover:bg-red-500/20 hover:border-red-500 hover:scale-105 transition-all";
                }

                return (
                    <div
                        key={index}
                        className={`
                aspect-[4/3] flex items-center justify-center rounded-xl border p-2 text-center text-sm md:text-lg font-medium transition-all duration-300
                ${cardStyle}
            `}
                        onClick={() => canClick && onWordClick(index)}
                    >
                        {word}
                    </div>
                );
            })}
        </div>
    );
};

export default WordGrid;
