import React, { useEffect, useRef, useState, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    delay?: string;
    direction?: 'up' | 'left' | 'right';
}

export const FadeInSection: React.FC<Props> = ({ children, delay = '0ms', direction = 'up' }) => {
    const [isVisible, setVisible] = useState(false);
    const domRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    if (domRef.current) {
                        observer.unobserve(domRef.current);
                    }
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        const currentRef = domRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            if (currentRef) {
                observer.unobserve(currentRef);
            }
        };
    }, []);

    let transformClass = 'translate-y-12';
    if (direction === 'left') transformClass = '-translate-x-12';
    if (direction === 'right') transformClass = 'translate-x-12';

    return (
        <div
            ref={domRef}
            className={`transition-all duration-1000 ease-out will-change-[opacity,transform] ${isVisible ? 'opacity-100 translate-y-0 translate-x-0' : `opacity-0 ${transformClass}`
                }`}
            style={{ transitionDelay: delay }}
        >
            {children}
        </div>
    );
};
