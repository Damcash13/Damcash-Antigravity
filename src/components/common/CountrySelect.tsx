import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { COUNTRIES, countryFlag, countryMatches } from '../../lib/countries';

interface Props {
  value: string;
  onChange: (code: string) => void;
  required?: boolean;
}

export const CountrySelect: React.FC<Props> = ({ value, onChange, required }) => {
  const { t } = useTranslation();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref               = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.length < 1
    ? COUNTRIES
    : COUNTRIES.filter(c => countryMatches(c, query));

  const selected = COUNTRIES.find(c => c.code === value);

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          color: selected ? 'var(--text-1)' : 'var(--text-3)',
          fontSize: 13, textAlign: 'left',
        }}
      >
        {selected ? (
          <>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{countryFlag(selected.code)}</span>
            <span>{selected.name}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11 }}>{selected.code}</span>
          </>
        ) : (
          <span>{t('auth.countryPlaceholder')}</span>
        )}
        <span style={{ marginLeft: selected ? 0 : 'auto', color: 'var(--text-3)' }}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 8, zIndex: 500, boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('auth.countrySearch')}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 6, fontSize: 12,
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                color: 'var(--text-1)',
              }}
            />
          </div>
          {/* Options list */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-3)' }}>
                {t('auth.noCountryFound')}
              </div>
            ) : filtered.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => handleSelect(c.code)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '7px 12px',
                  background: c.code === value ? 'var(--accent-dim)' : 'none',
                  border: 'none', cursor: 'pointer', color: 'var(--text-1)',
                  textAlign: 'left', fontSize: 13,
                }}
                onMouseEnter={e => { if (c.code !== value) (e.currentTarget as HTMLElement).style.background = 'var(--bg-2)'; }}
                onMouseLeave={e => { if (c.code !== value) (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{countryFlag(c.code)}</span>
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{c.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
