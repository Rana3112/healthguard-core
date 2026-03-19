import os

with open('components/FitnessPanel.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

s1 = text.find('{msg.suggestedQuestionCards.slice(0, 6).map((card, cardIndex) => (')
if s1 == -1:
    print("Not found")
    exit(1)

def find_nth(haystack, needle, n, start=0):
    for _ in range(n):
        start = haystack.find(needle, start)
        if start == -1:
            return -1
        start += len(needle)
    return start

match_end = find_nth(text, '</div>', 3, s1)
to_replace = text[s1:match_end]

replacement = r'''{msg.suggestedQuestionCards.slice(0, 6).map(
                            (card, cardIndex) => {
                                if (card.inputType === 'text') {
                                    return (
                                        <div key={itness-flash-} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-2.5">
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{card.question}</p>
                                            <TextInputFlashcard 
                                              card={card} 
                                              isLoading={isTyping} 
                                              onSend={(text, intent) => {
                                                handleCoachFlashcardOptionClick(card, {
                                                  label: text,
                                                  userStatement: text,
                                                  intent: intent as any
                                                });
                                              }} 
                                            />
                                        </div>
                                    );
                                }
                                return (
                                    <div key={itness-flash-} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-2.5">
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">{card.question}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {card.options?.map((option, optionIndex) => (
                                                <button
                                                    key={${option.label}-}
                                                    onClick={() => handleCoachFlashcardOptionClick(card, option)}
                                                    disabled={isTyping}
                                                    className="text-[11px] rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50"
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                        )}'''

text = text.replace(to_replace, replacement)

with open('components/FitnessPanel.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

print("patched fitness")
