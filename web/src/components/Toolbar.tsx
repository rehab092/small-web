'use client';

import { useEffect, useRef, useState } from 'react';
import { HISTORY_ADDR, HOME_ADDR, PUBLISH_ADDR, internalPage, searchAddr } from '@/lib/address';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(displayAddress(pendingAddr ?? addr));
  }, [addr, seq, pendingAddr]);

  const page = internalPage(addr);
  const active = (name: string) => (page === name ? 'tool tool--active' : 'tool');

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
            title="Back"
          >
            <BackIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={props.onForward}
            disabled={!props.canForward}
            aria-label="Forward"
            title="Forward"
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
          <input
            ref={inputRef}
            className="address__input"
            type="text"
            value={text}
            placeholder="Type an address like tidepool.zz, or search"
            aria-label="Address bar"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText(displayAddress(addr));
                e.currentTarget.blur();
              }
            }}
          />
          {loading && <span className="address__spinner" role="status" aria-label="Loading" />}
        </form>

        <nav className="tools" aria-label="Browser pages">
          <button
            type="button"
            className={active('search')}
            onClick={() => props.onGo(searchAddr(''))}
          >
            <SearchIcon /> <span>Search</span>
          </button>
          <button type="button" className={active('history')} onClick={() => props.onGo(HISTORY_ADDR)}>
            <ClockIcon /> <span>History</span>
          </button>
          <button type="button" className={active('publish')} onClick={() => props.onGo(PUBLISH_ADDR)}>
            <PlusIcon /> <span>Publish</span>
          </button>
        </nav>

        <label className="person">
          <span className="person__avatar" aria-hidden="true">
            {(people.find((p) => p.id === person)?.name ?? '?').slice(0, 1)}
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
      <div className={loading ? 'progress progress--on' : 'progress'} aria-hidden="true" />
    </header>
  );
}
