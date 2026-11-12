import { useEffect, useState } from 'react';

const ASCII_MARKS = ['·', '*', '+', '~', ':', '¤'];
const BADGE_BG = ['#111111', '#141418', '#151313', '#121614', '#161511'];

function hashNumber(seed = '') {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export default function Avatar({
  name = 'anonymous',
  avatarUrl = '',
  hash = '',
  size = 28,
  className = '',
}) {
  const [failedUrl, setFailedUrl] = useState('');

  useEffect(() => {
    setFailedUrl('');
  }, [avatarUrl]);

  const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl;
  const seed = hash || name || 'anon';
  const num = hashNumber(seed);
  const bg = BADGE_BG[num % BADGE_BG.length];
  const mark = ASCII_MARKS[num % ASCII_MARKS.length];

  const cleanName = (name || '').replace(/^@+/, '').trim();
  const initial =
    cleanName && cleanName.toLowerCase() !== 'anonymous'
      ? cleanName[0].toUpperCase()
      : '@';

  const fontSize = Math.max(9, Math.round(size * 0.38));

  return (
    <span
      className={`avatar-frame ${className}`.trim()}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: bg,
        fontSize: `${fontSize}px`,
      }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={avatarUrl}
          alt=""
          className="avatar-img"
          onError={() => setFailedUrl(avatarUrl)}
        />
      ) : (
        <span className="avatar-ascii">
          {initial}
          <span className="avatar-ascii-mark">{mark}</span>
        </span>
      )}
    </span>
  );
}
