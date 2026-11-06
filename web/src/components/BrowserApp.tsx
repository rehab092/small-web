'use client';

import { useEffect } from 'react';
import {
  HOME_ADDR,
  classifyHref,
  internalPage,
  parsePublishAddr,
  parseSearchAddr,
  publishAddr,
  searchAddr,
} from '@/lib/address';
import { useBrowser } from '@/lib/use-browser';
import { useShortcuts } from '@/lib/use-shortcuts';
import { SiteFrame } from './SiteFrame';
import { Toolbar } from './Toolbar';
import { CloseIcon } from './icons';
import { HistoryView } from './views/HistoryView';
import { HomeView } from './views/HomeView';
import { PublishView } from './views/PublishView';
import { SearchView } from './views/SearchView';
import { ErrorView, LoadingView, NowhereView } from './views/StatusViews';

/** The browser: chrome on top, one page below. */
export function BrowserApp() {
  const b = useBrowser();
  const runShortcut = useShortcuts({
    canBack: b.canBack,
    canForward: b.canForward,
    onBack: b.back,
    onForward: b.forward,
  });
  const { notice, dismissNotice } = b;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(dismissNotice, 7000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  if (b.bootError) {
    return (
      <div className="boot">
        <h1>The Small Web is out of reach</h1>
        <p>{b.bootError}</p>
        <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!b.ready || !b.snapshot) {
    return (
      <div className="boot" aria-busy="true">
        <p className="eyebrow">The Small Web</p>
        <p>Opening the browser…</p>
      </div>
    );
  }

  const { snapshot, page } = b;
  const entry = snapshot.entry;
  const personName = b.people.find((p) => p.id === b.person)?.name ?? b.person;

  const scrollOf = () => b.scrollOf(entry.id);
  const saveScroll = (y: number) => b.saveScroll(entry.id, y);

  const handleLink = (href: string) => {
    const target = classifyHref(href);
    if (target.kind === 'site') b.go(target.address, 'link');
    else if (target.kind === 'external') {
      b.say(`${target.href} is outside the Small Web. The link is shown, never followed.`, 'warn');
    } else if (target.kind === 'blocked') {
      b.say('That link uses a scheme the Small Web does not follow.', 'warn');
    }
  };

  let content;
  switch (page.kind) {
    case 'site':
      content = (
        <SiteFrame
          key={`${entry.id}:${snapshot.seq}`}
          html={page.site.html}
          title={page.site.title}
          restoreY={scrollOf()}
          onLink={handleLink}
          onScroll={saveScroll}
          onKey={runShortcut}
        />
      );
      break;
    case 'nowhere':
      content = (
        <NowhereView
          addr={page.addr}
          onPublish={(a) => b.go(publishAddr(a), 'link')}
          onHome={() => b.go(HOME_ADDR, 'link')}
        />
      );
      break;
    case 'loading':
      content = <LoadingView addr={page.addr} />;
      break;
    case 'error':
      content = <ErrorView addr={page.addr} message={page.message} onRetry={b.reload} />;
      break;
    default: {
      const kind = internalPage(page.addr);
      if (kind === 'history') {
        content = (
          <HistoryView
            key={entry.id}
            entryId={entry.id}
            person={b.person}
            personName={personName}
            scroll={scrollOf()}
            cache={b.viewCache}
            onOpen={(a) => b.go(a, 'history')}
            saveScroll={saveScroll}
          />
        );
      } else if (kind === 'search') {
        content = (
          <SearchView
            key={entry.id}
            entryId={entry.id}
            query={parseSearchAddr(page.addr) ?? ''}
            scroll={scrollOf()}
            cache={b.viewCache}
            onSearch={(q) => b.go(searchAddr(q), 'typed')}
            onOpen={(a) => b.go(a, 'search')}
            saveScroll={saveScroll}
          />
        );
      } else if (kind === 'publish') {
        content = (
          <PublishView
            key={entry.id}
            entryId={entry.id}
            people={b.people}
            person={b.person}
            prefill={parsePublishAddr(page.addr)}
            scroll={scrollOf()}
            cache={b.viewCache}
            onVisit={(a) => b.go(a, 'typed')}
            saveScroll={saveScroll}
          />
        );
      } else {
        content = (
          <HomeView
            key={entry.id}
            entryId={entry.id}
            scroll={scrollOf()}
            cache={b.viewCache}
            onOpen={(a) => b.go(a, 'link')}
            onGo={(a) => b.go(a, 'typed')}
            saveScroll={saveScroll}
          />
        );
      }
    }
  }

  return (
    <div className="app">
      <Toolbar
        people={b.people}
        person={b.person}
        addr={entry.addr}
        seq={snapshot.seq}
        pendingAddr={b.pendingAddr}
        loading={page.kind === 'loading' || b.pendingAddr !== null}
        canBack={b.canBack}
        canForward={b.canForward}
        onBack={b.back}
        onForward={b.forward}
        onReload={b.reload}
        onOpen={b.open}
        onGo={(a) => b.go(a, 'typed')}
        onPerson={b.switchPerson}
      />
      {notice && (
        <div className={`notice notice--${notice.tone}`} role="status" key={notice.id}>
          <span>{notice.text}</span>
          <button type="button" className="icon-btn icon-btn--small" onClick={dismissNotice} aria-label="Dismiss">
            <CloseIcon />
          </button>
        </div>
      )}
      <main className="viewport">{content}</main>
    </div>
  );
}
