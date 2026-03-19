import React from 'react';

interface HealthGuardIconProps {
    size?: number;
    opacity?: number;
    glowColor?: string;
    animationDelay?: string;
    animationDuration?: string;
    className?: string;
}

export const HealthGuardIcon: React.FC<HealthGuardIconProps> = ({
    size = 1,
    opacity = 1,
    glowColor = '#5eead4', // Medical 300
    animationDelay = '0s',
    animationDuration = '3s',
    className = '',
}) => {
    return (
        <div
            className={`inline-block ${className}`}
            style={{
                transform: `scale(${size})`,
                opacity: opacity,
            }}
        >
            <svg
                width="64"
                height="64"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                    overflow: 'visible',
                }}
            >
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    <style>
                        {`
              @keyframes pulseCross {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
              }
              @keyframes breatheShield {
                0%, 100% { transform: scaleY(1) translateY(0); }
                50% { transform: scaleY(1.05) translateY(-2px); }
              }
              @keyframes beatLine {
                0%, 100% { transform: translateX(0); }
                50% { transform: translateX(4px); }
              }
              
              .animated-cross {
                animation: pulseCross 2s ease-in-out infinite;
                transform-origin: center;
              }
              .animated-shield {
                animation: breatheShield ${animationDuration} ease-in-out infinite;
                animation-delay: ${animationDelay};
                transform-origin: center bottom;
              }
              .animated-line {
                animation: beatLine 1.5s ease-in-out infinite;
              }
            `}
                    </style>
                </defs>

                <g className="animated-shield">
                    {/* Main Shield */}
                    <path
                        d="M32 4L12 10V26C12 40.5 20.5 53.5 32 60C43.5 53.5 52 40.5 52 26V10L32 4Z"
                        stroke="white"
                        strokeWidth="1.5"
                        fill="transparent"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {/* Inner Heart overlapping bottom */}
                    <path
                        d="M32 50C32 50 18 38 18 28C18 22 23 18 28 18C30.5 18 32 20 32 20C32 20 33.5 18 36 18C41 18 46 22 46 28C46 38 32 50 32 50Z"
                        fill="#14b8a6" // Primary Teal
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                    />

                    {/* EKG Line */}
                    <path
                        d="M16 28L22 28L26 18L32 38L38 22L41 28L48 28"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        className="animated-line"
                    />
                </g>

                {/* Glowing Medical Cross */}
                <g
                    className="animated-cross"
                    filter="url(#glow)"
                >
                    <path
                        d="M26 30H38V34H26V30Z"
                        fill={glowColor}
                    />
                    <path
                        d="M30 26H34V38H30V26Z"
                        fill={glowColor}
                    />
                </g>

                {/* Laurel Branches */}
                {/* Left Branch */}
                <g stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round">
                    <path d="M12 48C6 42 4 32 6 24" />
                    <path d="M10 44C8 42 8 40 10 38C12 40 12 42 10 44Z" fill="white" />
                    <path d="M7 36C5 34 5 32 7 30C9 32 9 34 7 36Z" fill="white" />
                    <path d="M5.5 28C4 26 4 24 5.5 22C7 24 7 26 5.5 28Z" fill="white" />
                </g>

                {/* Right Branch */}
                <g stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round">
                    <path d="M52 48C58 42 60 32 58 24" />
                    <path d="M54 44C56 42 56 40 54 38C52 40 52 42 54 44Z" fill="white" />
                    <path d="M57 36C59 34 59 32 57 30C55 32 55 34 57 36Z" fill="white" />
                    <path d="M58.5 28C60 26 60 24 58.5 22C57 24 57 26 58.5 28Z" fill="white" />
                </g>

            </svg>
        </div>
    );
};
