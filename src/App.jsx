import { useCallback, useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  LayoutDashboard,
  Files,
  Upload,
  Library,
  Users,
  ChartNoAxesCombined,
  Wallet,
  Settings2,
  ArrowUpRight,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  GraduationCap,
  Check,
} from 'lucide-react';
import { auth, mediaUrl } from './api';
import { isDemo, useResource } from './data';
import { Brand, Button, Empty, ErrorBox, Loading } from './components';
import Builder from './Builder';
import ExamDetail from './ExamDetail';
import UploadPage from './Upload';
import QuestionLibrary from './Library';
import Overview from './pages/Overview';
import Exams from './pages/Exams';
import Insights from './pages/Insights';
import Payments from './pages/Payments';
import Settings from './pages/Settings';
import Auth, { WorkspaceSetup, Recovery } from './pages/Auth';
const navItems = [
  ['overview', 'Overview', LayoutDashboard],
  ['exams', 'My exams', Files],
  ['uploads', 'Uploads', Upload],
  ['library', 'Question library', Library],
  ['students', 'Students', Users],
  ['insights', 'Insights', ChartNoAxesCombined],
  ['payments', 'Earnings', Wallet],
];
const titles = {
  overview: 'Overview',
  exams: 'My exams',
  uploads: 'Uploads',
  library: 'Question library',
  students: 'Students',
  insights: 'Insights',
  payments: 'Earnings',
  settings: 'Workspace settings',
};
export default function App() {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(isDemo || !auth),
    [route, setRoute] = useState(location.hash.slice(1) || 'overview');
  const [version, setVersion] = useState(0),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(''),
    [theme, setTheme] = useState(() => localStorage.getItem('pastq-teacher-theme') || 'light');
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => setPhone(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!phone || !mobile) return;
    const trigger = document.activeElement;
    const sidebar = document.querySelector('.sidebar');
    const focusable = () =>
      [...sidebar.querySelectorAll('button, a[href]')].filter((element) => !element.disabled);
    focusable()[0]?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape') {
        setMobile(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first || !sidebar.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !sidebar.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keyboard);
      if (sidebar.contains(document.activeElement) && trigger instanceof HTMLElement)
        trigger.focus();
    };
  }, [phone, mobile]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pastq-teacher-theme', theme);
  }, [theme]);
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(1) || 'overview');
      setMobile(false);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (!auth || isDemo) return;
    let active = true;
    auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setReady(true);
      }
    });
    const { data } = auth.onAuthStateChange((_event, s) => {
      if (active) {
        setSession(s);
        setReady(true);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const identity = isDemo ? 'demo' : session?.user.id || '';
  const me = useResource(isDemo || session ? '/teacher/me' : null, version, identity);
  const exams = useResource(me.data?.profile ? '/teacher/exams' : null, version, identity);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!me.data?.profile) return;
    const refresh = () => {
      if (!document.hidden) setVersion((v) => v + 1);
    };
    const interval = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [me.data?.profile?.id]);
  const go = (value) => {
    setMobile(false);
    location.hash = value;
  };
  const notify = useCallback((message) => {
    setToast(message);
    setVersion((v) => v + 1);
  }, []);
  if (!ready) return <Loading />;
  if (session && new URLSearchParams(location.search).get('recovery') === '1') return <Recovery />;
  if (!session && !isDemo)
    return (
      <Auth
        onDemo={() => {
          location.href = '/?demo=1';
        }}
      />
    );
  if (me.loading) return <Loading />;
  if (me.error)
    return (
      <div className="fatal">
        <Brand />
        <ErrorBox error={me.error} retry={() => setVersion((v) => v + 1)} />
        <Button onClick={() => auth?.signOut()}>Sign out</Button>
      </div>
    );
  if (!me.data?.profile)
    return (
      <WorkspaceSetup
        user={me.data?.user}
        onSaved={() => notify('Your teacher workspace is ready.')}
      />
    );
  const page = route.split('/')[0],
    list = exams.data?.items || [],
    profile = me.data.profile;
  const building = page === 'exams' && (route === 'exams/new' || route.endsWith('/edit'));
  return (
    <div className={building ? 'app-shell is-builder' : 'app-shell'}>
      <button
        className={`sidebar-overlay ${mobile ? 'visible' : ''}`}
        aria-label="Close navigation"
        onClick={() => setMobile(false)}
      />
      <aside
        aria-label="Teacher navigation"
        aria-hidden={phone && !mobile}
        inert={phone && !mobile ? '' : undefined}
        role={phone && mobile ? 'dialog' : undefined}
        aria-modal={phone && mobile ? true : undefined}
        className={`sidebar ${mobile ? 'open' : ''}`}
      >
        <a href="#overview" className="sidebar-brand">
          <Brand />
        </a>
        <button
          className="icon-btn sidebar-close"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X size={21} />
        </button>
        <div className="workspace-identity">
          <span className="workspace-avatar">
            {profile.logo ? (
              <img src={mediaUrl(profile.logo)} alt="" />
            ) : (
              <GraduationCap size={22} />
            )}
          </span>
          <div>
            <strong>{profile.organization || profile.name}</strong>
            <small>Teacher workspace</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navItems.map(([id, title, Icon]) => (
            <button className={page === id ? 'selected' : ''} key={id} onClick={() => go(id)}>
              <Icon size={19} strokeWidth={1.7} />
              <span>{title}</span>
              {id === 'exams' && list.length > 0 && <b>{list.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <strong>Your question bank</strong>
            <p>Build focused practice from the PastQ library.</p>
            <button onClick={() => go('exams/new')}>
              Create an exam <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={`settings-link ${page === 'settings' ? 'selected' : ''}`}
            onClick={() => go('settings')}
          >
            <Settings2 size={18} />
            Workspace settings
          </button>
          <div className="profile">
            <span className="avatar">
              {profile.name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <strong>{profile.name}</strong>
              <small>Teacher</small>
            </div>
            <button
              className="icon-btn"
              aria-label="Sign out"
              onClick={() => (isDemo ? location.assign('/') : auth.signOut())}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div
        className="main-shell"
        inert={phone && mobile ? '' : undefined}
        aria-hidden={phone && mobile ? true : undefined}
      >
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{titles[page] || 'Exam studio'}</strong>
          </div>
          <div className="topbar-actions">
            <span className="live-pill">
              <i />
              {isDemo ? 'Preview workspace' : 'Your teaching space'}
            </span>
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              aria-label={theme === 'light' ? 'Use dark theme' : 'Use light theme'}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <span className="avatar small">{profile.name[0]}</span>
          </div>
        </header>
        {isDemo && (
          <div className="demo-banner">
            Demo workspace · Sample exams and results. Changes stay in this tab.
            <a href="/">
              Use your own account <ArrowRight size={13} />
            </a>
          </div>
        )}
        <main className="main-content" key={route}>
          {page === 'exams' && route.split('/')[1] ? (
            route.endsWith('/edit') || route === 'exams/new' ? (
              <Builder
                id={route === 'exams/new' ? null : route.split('/')[1]}
                go={go}
                notify={notify}
                profile={profile}
              />
            ) : (
              <ExamDetail id={route.split('/')[1]} go={go} notify={notify} version={version} />
            )
          ) : page === 'overview' ? (
            <Overview exams={list} resource={exams} profile={profile} go={go} version={version} />
          ) : page === 'exams' ? (
            <Exams exams={list} error={exams.error} loading={exams.loading} go={go} />
          ) : page === 'uploads' ? (
            <UploadPage go={go} notify={notify} version={version} />
          ) : page === 'library' ? (
            <QuestionLibrary go={go} notify={notify} exams={list} />
          ) : page === 'students' || page === 'insights' ? (
            <Insights exams={list} go={go} version={version} studentView={page === 'students'} />
          ) : page === 'payments' ? (
            <Payments version={version} go={go} />
          ) : page === 'settings' ? (
            <Settings profile={profile} notify={notify} version={version} />
          ) : (
            <Empty
              title="This page is unavailable"
              action={<Button onClick={() => go('overview')}>Back to overview</Button>}
            />
          )}
        </main>
        <footer className="page-footer">
          <span>
            PastQ for teachers <i /> Teacher workspace
          </span>
          <span></span>
        </footer>
      </div>
      {!building && (
        <nav
          className="mobile-bottom-nav"
          aria-label="Main navigation"
          inert={phone && mobile ? '' : undefined}
          aria-hidden={phone && mobile ? true : undefined}
        >
          {[
            ['overview', 'Home', LayoutDashboard],
            ['exams', 'Exams', Files],
            ['uploads', 'Upload', Upload],
            ['library', 'Library', Library],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              className={page === value ? 'active' : ''}
              aria-current={page === value ? 'page' : undefined}
              onClick={() => go(value)}
            >
              <Icon size={21} strokeWidth={page === value ? 2 : 1.6} />
              <span>{label}</span>
            </button>
          ))}
          <button
            className={
              ['students', 'insights', 'payments', 'settings'].includes(page) ? 'active' : ''
            }
            aria-label="More pages"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
            <span>More</span>
          </button>
        </nav>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button className="icon-btn" aria-label="Dismiss message" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
