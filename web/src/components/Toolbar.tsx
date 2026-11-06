'use client';

import { useEffect, useRef, useState } from 'react';
import {
  HISTORY_ADDR,
  HOME_ADDR,
  PUBLISH_ADDR,
  addressParts,
  internalPage,
  searchAddr,
} from '@/lib/address';
import { useDelayedFlag } from '@/lib/delayed-flag';
import { ADDRESS_BAR_ID } from '@/lib/shortcuts';
import { displayAddress } from '@/lib/use-browser';
import type { PersonDto } from '@/lib/types';
import {
  BackIcon,
  ClockIcon,
  ForwardIcon,
  GlobeIcon,
  HomeIcon,
  PlusIcon,
  ReloadIcon,
  SearchIcon,
} from './icons';

interface Props {
  people: PersonDto[];
  person: string;
  /** The address of the current stack entry. */
  addr: string;
  /** Changes whenever the shown page changes (resets the address bar text). */
  seq: number;
  /** The site address being loaded, if a navigation is pending. */
  pendingAddr: string | null;
  loading: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onOpen: (input: string) => void;
  onGo: (addr: string) => void;
  onPerson: (id: string) => void;
}

export function Toolbar(props: Props) {
  const { people, person, addr, seq, pendingAddr, loading } = props;
  const [text, setText] = useState(displayAddress(addr));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // a spinner only for loads that last: no flash for fast ones, no blink off
  const showLoading = useDelayedFlag(loading);

  useEffect(() => {
    setText(displayAddress(pendingAddr ?? addr));
  }, [addr, seq, pendingAddr]);

  const page = internalPage(addr);
  const active = (name: string) => (page === name ? 'tool tool--active' : 'tool');
  const parts = !focused ? addressParts(text) : null;
  const personName = people.find((p) => p.id === person)?.name ?? '?';

  return (
    <header className="chrome">
      <div className="chrome__row">
        <div className="nav-buttons" role="group" aria-label="Navigation">
          <button
            type="button"
            className="icon-btn"
            onClick={props.onBack}
            disabled={!props.canBack}
            aria-label="Back"
            aria-keyshortcuts="Alt+ArrowLeft"
            title="Back (Alt+Left)"
          >
            <BackIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={props.onForward}
            disabled={!props.canForward}
            aria-label="Forward"
            aria-keyshortcuts="Alt+ArrowRight"
            title="Forward (Alt+Right)"
          >
            <ForwardIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={props.onReload}
            aria-label="Reload"
            title="Reload"
          >
            <ReloadIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => props.onGo(HOME_ADDR)}
            aria-label="Home"
            title="Home"
          >
            <HomeIcon />
          </button>
        </div>

        <form
          className="address"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            props.onOpen(text);
            inputRef.current?.blur();
          }}
        >
          <span className="address__icon">
            <GlobeIcon />
          </span>
          <div className="address__field">
            <input
              ref={inputRef}
              id={ADDRESS_BAR_ID}
              className={parts ? 'address__input address__input--covered' : 'address__input'}
              type="text"
              value={text}
              placeholder="Type an address like tidepool.zz, or search"
              aria-label="Address bar"
              aria-keyshortcuts="Control+L Meta+L"
              title="Address bar (Ctrl+L)"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => {
                setFocused(true);
                e.currentTarget.select();
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setText(displayAddress(addr));
                  e.currentTarget.blur();
                }
              }}
            />
            {parts && (
              <span className="address__styled" aria-hidden="true">
                {parts.scheme && <span className="address__scheme">{parts.scheme}</span>}
                <span className="address__host">{parts.host}</span>
                <span className="address__tld">{parts.tld}</span>
              </span>
            )}
          </div>
          {showLoading && <span className="address__spinner" role="status" aria-label="Loading" />}
        </form>

        <nav className="tools" aria-label="Browser pages">
          <button
            type="button"
            className={active('search')}
            onClick={() => props.onGo(searchAddr(''))}
            aria-current={page === 'search' ? 'page' : undefined}
            aria-label="Search"
          >
            <SearchIcon /> <span>Search</span>
          </button>
          <button
            type="button"
            className={active('history')}
            onClick={() => props.onGo(HISTORY_ADDR)}
            aria-current={page === 'history' ? 'page' : undefined}
            aria-label="History"
          >
            <ClockIcon /> <span>History</span>
          </button>
          <button
            type="button"
            className={active('publish')}
            onClick={() => props.onGo(PUBLISH_ADDR)}
            aria-current={page === 'publish' ? 'page' : undefined}
            aria-label="Publish"
          >
            <PlusIcon /> <span>Publish</span>
          </button>
        </nav>

        <label className="person">
          <span className="person__avatar" aria-hidden="true">
            {personName.slice(0, 1)}
          </span>
          <span className="sr-only">Browsing as</span>
          <select
            value={person}
            onChange={(e) => props.onPerson(e.target.value)}
            aria-label="Browsing as"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={showLoading ? 'progress progress--on' : 'progress'} aria-hidden="true" />
      {/* announced to screen readers; visual loading is the spinner and bar above */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading ? `Loading ${displayAddress(pendingAddr ?? addr) || 'page'}` : ''}
      </div>
    </header>
  );
}
