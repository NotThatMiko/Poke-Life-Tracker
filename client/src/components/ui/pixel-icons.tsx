import React from 'react';

// Cute inline SVGs for the pixel aesthetic instead of smooth vector icons
export const PixelHeart = ({ className = "w-6 h-6", color = "currentColor" }: { className?: string, color?: string }) => (
  <svg viewBox="0 0 11 11" className={className} fill={color} xmlns="http://www.w3.org/2000/svg" style={{ shapeRendering: 'crispEdges' }}>
    <path d="M2 1h2v1h1v1h1V2h1V1h2v2h1v3h-1v2h-1v1H7v1H6v1H5v-1H4v-1H3V8H2V6H1V3h1V1z" />
  </svg>
);

export const PixelStar = ({ className = "w-6 h-6", color = "currentColor" }: { className?: string, color?: string }) => (
  <svg viewBox="0 0 11 11" className={className} fill={color} xmlns="http://www.w3.org/2000/svg" style={{ shapeRendering: 'crispEdges' }}>
    <path d="M5 0h1v3h3v1H6v2h3v1H6v3H5V7H2V6h3V4H2V3h3V0z" />
    <path d="M4 1H3v1h1V1zm3 0h1v1H7V1zM2 8h1v1H2V8zm6 0h1v1H8V8z" fillOpacity="0.5"/>
  </svg>
);

export const PixelSword = ({ className = "w-6 h-6", color = "currentColor" }: { className?: string, color?: string }) => (
  <svg viewBox="0 0 13 13" className={className} fill={color} xmlns="http://www.w3.org/2000/svg" style={{ shapeRendering: 'crispEdges' }}>
    <path d="M10 0h3v3h-1v1h-1v1H9v1H8v1H7v1H5V7H4v1H2v2H1v1H0v2h2v-1h1v-1h2V9h1V8h1V7h1V6h1V5h1V4h1V3h1V0h-1zM2 11H1v-1h1v1zm8-8h1v1h-1V3z"/>
  </svg>
);
