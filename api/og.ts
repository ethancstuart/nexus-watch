import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default function handler() {
  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          fontFamily: 'JetBrains Mono, monospace',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // Glow effect
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '800px',
                height: '800px',
                background: 'radial-gradient(circle, rgba(0, 255, 136, 0.08) 0%, transparent 70%)',
              },
            },
          },
          // Title
          {
            type: 'div',
            props: {
              style: {
                fontSize: '72px',
                fontWeight: 700,
                color: '#00ff88',
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                marginBottom: '16px',
              },
              children: 'DashPulse',
            },
          },
          // Tagline
          {
            type: 'div',
            props: {
              style: {
                fontSize: '24px',
                color: '#a1a1aa',
                marginBottom: '48px',
                letterSpacing: '0.02em',
              },
              children: 'Your personal intelligence terminal.',
            },
          },
          // Feature pills
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap' as const,
                justifyContent: 'center',
                maxWidth: '900px',
              },
              children: ['Weather', 'Markets', 'News', 'Sports', 'Crypto', 'AI Chat', 'Calendar', 'GitHub'].map(
                (label) => ({
                  type: 'div',
                  props: {
                    style: {
                      padding: '8px 20px',
                      border: '1px solid #262626',
                      borderRadius: '4px',
                      fontSize: '16px',
                      color: '#fafafa',
                      background: 'rgba(255, 255, 255, 0.03)',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase' as const,
                    },
                    children: label,
                  },
                }),
              ),
            },
          },
          // Footer
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                bottom: '32px',
                fontSize: '14px',
                color: '#52525b',
                letterSpacing: '0.04em',
              },
              children: 'Open source \u00B7 Built with Claude Code',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
    },
  );
}
