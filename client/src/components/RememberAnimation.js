"use client";

import { useEffect, useRef } from "react";

const HEARTS = ["❤️", "💕", "💖", "💗", "💓", "💞", "💘", "💝"];
const SPARKLES = ["✨", "⭐", "🌟", "💫"];
const PARTICLE_COUNT = 22;
const ANIMATION_DURATION = 3500;

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function generateParticles() {
  const particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const isHeart = i < 14;
    const pool = isHeart ? HEARTS : SPARKLES;
    particles.push({
      id: i,
      emoji: pool[Math.floor(Math.random() * pool.length)],
      left: randomBetween(5, 95),
      delay: randomBetween(0, 1.8),
      duration: randomBetween(2.2, 3.5),
      size: isHeart ? randomBetween(1.2, 2.8) : randomBetween(0.8, 1.6),
      startY: randomBetween(100, 130),
      sway: randomBetween(-30, 30)
    });
  }
  return particles;
}

export default function RememberAnimation({ visible, senderName, onComplete }) {
  const timerRef = useRef(null);
  const particlesRef = useRef(generateParticles());

  useEffect(() => {
    if (!visible) {
      return;
    }

    particlesRef.current = generateParticles();

    timerRef.current = setTimeout(() => {
      onComplete?.();
    }, ANIMATION_DURATION);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [visible, onComplete]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="remember-overlay"
      onClick={() => onComplete?.()}
      role="presentation"
    >
      {particlesRef.current.map((p) => (
        <span
          key={p.id}
          className="remember-particle"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}rem`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--sway": `${p.sway}px`,
            "--start-y": `${p.startY}%`
          }}
        >
          {p.emoji}
        </span>
      ))}

      <div className="remember-center">
        <span className="remember-heart-pulse">💕</span>
        <p className="remember-text">
          {senderName || "Someone"} <span className="remember-text-soft">Remembered You</span>
        </p>
      </div>
    </div>
  );
}
