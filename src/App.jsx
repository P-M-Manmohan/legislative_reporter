import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Bookmark, BookmarkCheck, Check, ChevronRight, CircleHelp, ExternalLink, Filter, Globe2, Headphones, Home, Info, Languages, Mic, MoreHorizontal, Play, Search, Settings, Share2, Sparkles, UserRound, Users, X } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { assemblyImage, questions, topics } from './data';
import { apiFetch } from './services/api';

const nav = [{ id: 'home', label: 'Home', icon: Home }, { id: 'search', label: 'Search', icon: Search }, { id: 'verify', label: 'Verify', icon: Check }, { id: 'mla', label: 'MLAs', icon: Users }, { id: 'more', label: 'More', icon: MoreHorizontal }];
function stored(key, initial) { const [value, setValue] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; } }); useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]); return [value, setValue]; }

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = stored('language', 'EN'); const [dark, setDark] = stored('dark-mode', false); const [fontSize, setFontSize] = stored('font-size', 'medium'); const [saved, setSaved] = stored('saved-questions', []); const [selected, setSelected] = useState(questions[0]); const [claim, setClaim] = useState(''); const [result, setResult] = useState(null);
  const [splash, setSplash] = useState(() => !sessionStorage.getItem('niyamasabha-splash-shown'));
  const screen = location.pathname.slice(1) || 'home';
  const setScreen = (next, options) => navigate(`/${next}`, options);
  useEffect(() => document.body.setAttribute('data-theme', dark ? 'dark' : 'light'), [dark]); useEffect(() => document.body.setAttribute('data-font', fontSize), [fontSize]);
  useEffect(() => {
    if (!splash) return undefined;
    const timer = window.setTimeout(() => {
      sessionStorage.setItem('niyamasabha-splash-shown', 'true');
      setSplash(false);
      navigate('/home', { replace: true });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [navigate, splash]);
  useEffect(() => {
    const handleNativeBack = async () => {
      if (location.pathname !== '/home') {
        navigate(-1);
        return;
      }
      if (window.confirm('Do you want to exit Niyamasabha AI?')) await CapacitorApp.exitApp();
    };
    let listener;
    CapacitorApp.addListener('backButton', handleNativeBack).then((subscription) => { listener = subscription; });
    return () => { listener?.remove(); };
  }, [location.pathname, navigate]);
  useEffect(() => {
    const handleBrowserBack = (event) => {
      if (location.pathname === '/home' && !window.confirm('Do you want to exit Niyamasabha AI?')) {
        event.preventDefault();
        window.history.pushState({}, '', '/home');
      }
    };
    window.addEventListener('popstate', handleBrowserBack);
    return () => window.removeEventListener('popstate', handleBrowserBack);
  }, [location.pathname]);
  const shared = { language, setLanguage, setScreen, goBack: () => navigate(-1), saved, toggleSaved: (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]), openQuestion: (q) => { setSelected(q); setScreen('question', { state: { questionId: q.id } }); }, dark, setDark, fontSize, setFontSize };
  const submit = (e) => { e.preventDefault(); if (claim.trim()) { setResult({ claim: claim.trim() }); setScreen('verification'); } };
  if (splash) return <div className="app-shell splash-shell"><main className="app-main"><Welcome /></main></div>;
  return <div className="app-shell"><main className="app-main">
    {screen === 'home' && <HomePage {...shared} />}{screen === 'search' && <SearchPage {...shared} />}{screen === 'topics' && <TopicsPage {...shared} />}{screen === 'all-summaries' && <AllVideoSummariesPage {...shared} />}{screen === 'live' && <LivePage setScreen={setScreen} />}{screen === 'question' && <QuestionPage {...shared} question={selected} />}{screen === 'verify' && <VerifyPage {...shared} claim={claim} setClaim={setClaim} onSubmit={submit} />}{screen === 'verification' && <VerificationPage {...shared} result={result} />}{screen === 'mla' && <MlaPage {...shared} />}{screen === 'more' && <MorePage {...shared} />}{screen === 'about' && <AboutPage setScreen={setScreen} />}{screen === 'saved-questions' && <SavedQuestionsPage {...shared} />}{screen === 'saved-searches' && <EmptyMenuPage title="Saved Searches" message="You have no saved searches yet." setScreen={setScreen} />}{screen === 'notifications' && <EmptyMenuPage title="Notifications" message="You have no notifications yet." setScreen={setScreen} />}{screen === 'help' && <HelpPage setScreen={setScreen} />}
  </main>{screen !== 'welcome' && <nav className="bottom-nav">{nav.map(({ id, label, icon: Icon }) => <button className={screen === id ? 'active' : ''} key={id} onClick={() => setScreen(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>}</div>;
}
function Brand({ language, setLanguage }) {
  return (
    <div className="brand">
      <img className="brand-mark logo-image" src="/images/kerala-state-emblem.png" alt="Kerala State Emblem" />
      <div className="brand-text">
        <strong>Niyamasabha <span>AI</span></strong>
        <small>Your window to Kerala Legislature</small>
      </div>
      <button
        type="button"
        className="language-toggle"
        onClick={() => setLanguage(language === 'EN' ? 'മലയാളം' : 'EN')}
        aria-label="Toggle language"
      >
        <Globe2 size={13} />
        <span>{language}</span>
      </button>
    </div>
  );
}
function TopBar({ title, onBack, actions }) { return <header className="topbar">{onBack && <button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button>}<h1>{title}</h1><div className="top-actions">{actions}</div></header>; }
function Welcome() {
  return (
    <section className="welcome">
      <div className="welcome-copy">
        <p className="eyebrow">KERALA LEGISLATURE</p>
        <h1>Niyamasabha <span>AI</span></h1>
        <p className="lead">Your window to Kerala Legislature</p>
      </div>
      <div className="welcome-image">
        <div className="welcome-photo-container">
          <img src={assemblyImage} alt="Kerala Legislative Assembly building" />
          <div className="welcome-photo-overlay" />
        </div>
      </div>
      <div className="welcome-footer">
        <p className="welcome-tagline">Serving the people of Kerala</p>
      </div>
    </section>
  );
}
function HomePage({ language, setLanguage, setScreen }) {
  return (
    <section className="screen-pad">
      <div className="page-header">
        <Brand language={language} setLanguage={setLanguage} />
        <button type="button" className="icon-button" aria-label="Notifications">
          <Bell size={19} />
        </button>
      </div>

      <button type="button" className="search-box" onClick={() => setScreen('search')}>
        <Search size={17} />
        <span>Search questions, MLAs, topics...</span>
        <Mic size={17} />
      </button>

      <div className="session-card">
        <img src={assemblyImage} alt="Kerala Legislative Assembly" />
        <div className="session-overlay">
          <span className="live-pill">Assembly session</span>
          <small>Kerala Legislative Assembly</small>
          <strong>Question Hour</strong>
          <button type="button" className="watch-button" onClick={() => setScreen('live')}>
            <Play size={12} fill="currentColor" /> Watch Now
          </button>
        </div>
      </div>

      <VideoSummarySection setScreen={setScreen} />
    </section>
  );
}
function VideoSummarySection({ allVideos = false, setScreen }) {
  const [videos, setVideos] = useState([]);
  const [message, setMessage] = useState('');
  const friendlyError = (error) => error.message.includes('Backend is not configured')
    ? 'Set VITE_API_BASE_URL to a backend address this device can reach.'
    : error.message;
  useEffect(() => {
    let active = true;
    const refresh = () => apiFetch(`/api/videos?limit=${allVideos ? 500 : 10}`)
      .then((data) => { if (active) { setVideos(Array.isArray(data) ? data : []); setMessage(''); } })
      .catch((error) => { if (active) setMessage(friendlyError(error)); });
    refresh();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [allVideos]);
  return <section className="video-summaries" aria-labelledby="video-summaries-title">
    <div className="section-heading"><h2 className="section-title" id="video-summaries-title">Video summaries</h2></div>
    {videos.length > 0 ? <div className="video-summary-list">{videos.map((video) => <article className="video-summary-card" key={video.video_id}>
      <div className="video-summary-meta">{formatVideoDate(video.published_at)} · {video.segment_count} transcript segments</div>
      <h3>{video.title}</h3>
      <VideoSummaryPanel video={video} />
    </article>)}</div> : <p className="video-summary-status">{message || 'No transcript videos are available yet.'}</p>}
    {message && videos.length > 0 && <p className="video-summary-status" role="status">{message}</p>}
  </section>;
}
function AllVideoSummariesPage({ setScreen }) {
  return <section className="screen-pad">
    <TopBar title="Video summaries" onBack={() => setScreen('home')} />
    <VideoSummarySection allVideos setScreen={setScreen} />
  </section>;
}
function LivePage({ setScreen }) {
  const nextSitting = [26, 27, 28, 29]
    .map((day) => new Date(`2026-10-${day}T09:00:00+05:30`))
    .find((date) => date.getTime() > Date.now());
  const nextSittingLabel = nextSitting && new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(nextSitting);
  return <section className="screen-pad">
    <TopBar title="Assembly live session" onBack={() => setScreen('home')} />
    <div className="content-block live-status-card">
      <h3>Live stream</h3>
      <p>The app cannot confirm an active live stream right now. Check the official Assembly webcast for the current broadcast.</p>
      <a className="outline-button wide live-source-link" href="https://ondemandwebcast.niyamasabha.org/" target="_blank" rel="noreferrer">
        Open official webcast <ExternalLink size={15} />
      </a>
    </div>
    <div className="content-block">
      <h3>Next scheduled live session</h3>
      {nextSitting ? <p>{nextSittingLabel} at 9:00 AM IST. The session summons lists 9:00 AM as the meeting time; check the official notices or webcast in case the schedule changes.</p>
        : <p>No later sitting time is available in the currently published Assembly calendar. Check the official notices for the next announcement.</p>}
      <div className="live-source-links">
        <a className="live-calendar-link" href="https://www.niyamasabha.org/codes/16kla/session_2/2%20Session%20Calender%20.pdf" target="_blank" rel="noreferrer">
          Official sitting calendar <ExternalLink size={14} />
        </a>
        <a className="live-calendar-link" href="https://www.niyamasabha.org/codes/16kla/session_2/Notification%20-%20Summons%20-%20Second%20Session.pdf" target="_blank" rel="noreferrer">
          Session summons <ExternalLink size={14} />
        </a>
      </div>
    </div>
  </section>;
}
function VideoSummaryPanel({ video }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(video.summary || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSentence, setExpandedSentence] = useState(null);
  const toggleSummary = async () => {
    if (open) { setOpen(false); return; }
    if (!summary?.sentences?.length) {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(`/api/videos/${encodeURIComponent(video.video_id)}/summary`, { method: 'POST' });
        setSummary(data);
      } catch (fetchError) {
        setError(fetchError.message || 'Could not load the saved summary.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setOpen(true);
  };
  return <div className="video-summary-expand">
    <button type="button" className="video-summary-action" onClick={toggleSummary} disabled={loading} aria-expanded={open}>
      {loading ? 'Loading summary…' : open ? 'Hide summary' : 'Show summary'}
      <ChevronRight size={16} />
    </button>
    {error && <p className="video-summary-status" role="status">{error}</p>}
    {open && summary?.sentences?.length > 0 && <div className="summary-panel">
      <p className="summary-help">Transcript summary · tap a sentence to view source timestamps.</p>
      <p className="summary-paragraph">{summary.sentences.map((item, index) => <span className="summary-sentence-wrap" key={`${index}-${item.text}`}>
        <button type="button" className="summary-sentence" aria-expanded={expandedSentence === index} onClick={() => setExpandedSentence(expandedSentence === index ? null : index)}>{item.text}</button>{' '}
        {expandedSentence === index && <span className="summary-citations" role="dialog" aria-label="Source timestamps">
          <span>Verify in the original video</span>
          {(item.citations || []).map((citation) => <a key={citation.segment_id} href={`https://www.youtube.com/watch?v=${encodeURIComponent(summary.video_id)}&t=${Math.floor(citation.start_seconds)}s`} target="_blank" rel="noreferrer">
            {formatTimestamp(citation.start_seconds)} <ExternalLink size={13} />
          </a>)}
        </span>}
      </span>)}</p>
      <small className="summary-saved-note">Saved with this video’s transcript.</small>
    </div>}
  </div>;
}
function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function formatVideoDate(value) {
  if (!value) return 'Assembly video';
  const normalized = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 'Assembly video' : date.toLocaleDateString();
}
function SearchPage({ setScreen, openQuestion }) { const [query, setQuery] = useState(''); const [tab, setTab] = useState('All'); const list = useMemo(() => questions.filter((q) => `${q.title} ${q.mla} ${q.category}`.toLowerCase().includes(query.toLowerCase()) && (tab === 'All' || tab === 'Questions' || tab === 'MLAs')), [query, tab]); return <section className="screen-pad"><TopBar title="Search" onBack={() => setScreen('home')} actions={<button className="icon-button"><Filter size={18} /></button>} /><div className="search-box filled"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in questions..." /><X size={16} onClick={() => setQuery('')} /></div><div className="tabs">{['All', 'Questions', 'MLAs', 'Topics'].map((t) => <button className={tab === t ? 'active' : ''} key={t} onClick={() => setTab(t)}>{t}</button>)}</div><div className="result-count">{list.length} results • Question Hour</div><div className="results">{list.map((q) => <QuestionCard key={q.id} question={q} onClick={() => openQuestion(q)} />)}</div>{!list.length && <EmptyState text="No questions match your search." />}</section>; }
function TopicsPage({ setScreen, openQuestion }) {
  const location = useLocation();
  const [selectedTopic, setSelectedTopic] = useState(location.state?.topic || '');
  const relatedQuestions = useMemo(() => questions.filter((question) =>
    !selectedTopic || question.category === selectedTopic || question.tags?.includes(selectedTopic)
  ), [selectedTopic]);
  return <section className="screen-pad">
    <TopBar title="Trending topics" onBack={() => setScreen('home')} />
    <p className="page-intro">Choose a topic to explore related Assembly questions.</p>
    <div className="chips topic-selector" aria-label="Trending topics">
      {topics.map((topic) => <button type="button" aria-pressed={selectedTopic === topic} className={selectedTopic === topic ? 'selected' : ''} key={topic} onClick={() => setSelectedTopic(selectedTopic === topic ? '' : topic)}>{topic}</button>)}
    </div>
    {selectedTopic && <><h2 className="section-title">{selectedTopic}</h2>{relatedQuestions.length
      ? <div className="results">{relatedQuestions.map((question) => <QuestionCard key={question.id} question={question} onClick={() => openQuestion(question)} />)}</div>
      : <EmptyState text={`No verified Assembly questions are available for ${selectedTopic} yet.`} />}</>}
    {!selectedTopic && <EmptyState text="Select a topic to view related Assembly questions." />}
  </section>;
}
function QuestionCard({ question, onClick }) { return <button className="question-card" onClick={onClick}><div className="card-top"><span className="category-icon"><Search size={14} /></span><div><strong>{question.title}</strong><small>{question.date} · {question.session}</small></div><ChevronRight size={17} /></div><p>{question.preview}</p><div className="mla-row"><span className="avatar small">SP</span><small>Asked by <b>{question.mla}</b></small></div><div className="chips">{question.tags.map((t) => <span key={t}>{t}</span>)}</div></button>; }
function QuestionPage({ setScreen, question, saved, toggleSaved }) { const share = () => navigator.share ? navigator.share({ title: question.title, url: location.href }) : navigator.clipboard?.writeText(question.title); return <section className="screen-pad"><TopBar title="Question details" onBack={() => setScreen('search')} actions={<><button className="icon-button" onClick={() => toggleSaved(question.id)}>{saved.includes(question.id) ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button><button className="icon-button" onClick={share}><Share2 size={18} /></button></>} /><div className="detail-heading"><span className="category-label">{question.category} · Question Hour</span><h1>{question.title}</h1><small>{question.date}</small></div><div className="person-card"><span className="avatar">SP</span><div><small>Asked by</small><strong>{question.mla}</strong><small>{question.party}</small></div><span className="verified-dot"><Check size={12} /></span></div><Content title="Question" tag="Original source">{question.malayalam}</Content><Content title="English translation">Will the government consider setting up a super speciality hospital in Kochi to improve access to advanced care?</Content><Content title="Government reply">{question.reply}</Content><button className="video-card"><span className="play-circle"><Play size={16} fill="currentColor" /></span><span><b>View Original Video</b><small>00:42:15 - 00:45:30</small></span><ExternalLink size={16} /></button><div className="detail-tags">{question.tags.map((t) => <span key={t}>{t}</span>)}</div></section>; }
function Content({ title, tag, children }) { return <div className="content-block"><h3>{title}{tag && <span>{tag}</span>}</h3><p>{children}</p></div>; }
function VerifyPage({ setScreen, claim, setClaim, onSubmit }) { return <section className="screen-pad"><TopBar title="Verify a claim" onBack={() => setScreen('home')} /><p className="page-intro">Check political claims against available legislative records and reliable sources.</p><form onSubmit={onSubmit}><label className="field-label" htmlFor="claim">Enter a political claim or statement</label><div className="claim-field"><textarea id="claim" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="e.g. “Government built 10 new hospitals in 2023”" maxLength={300} /><button className="mic-button" type="button"><Mic size={17} /></button></div><div className="char-count">{claim.length}/300</div><button className="primary-button wide">Verify Claim <ArrowRight size={17} /></button></form><h2 className="section-title">Try these examples</h2><div className="examples">{['Government reduced unemployment in Kerala', '50,000 new housing units', 'No new taxes introduced this year'].map((x) => <button key={x} onClick={() => setClaim(x)}><Search size={14} /> {x}</button>)}</div><div className="info-box"><Sparkles size={17} /><p>We compare claims with available records. Results are informational and should be checked against original sources.</p></div></section>; }
function VerificationPage({ setScreen, result }) { return <section className="screen-pad"><TopBar title="Claim verification" onBack={() => setScreen('verify')} /><div className="claim-summary"><span>Q.</span><strong>“{result?.claim}”</strong></div><div className="verdict"><div className="verdict-icon"><Check size={23} /></div><div><span>Partially supported</span><small>Based on available assembly records</small></div><b>72%</b></div><div className="confidence"><span /></div><div className="ai-summary"><h3><Sparkles size={16} /> AI summary</h3><p>The available records support part of this claim, but the wording includes details that could not be fully verified from the sources reviewed.</p></div><h2 className="section-title">Sources (3)</h2><div className="source-list">{['Question Hour - 14 Mar 2023', 'Government Press Release', 'Budget Speech 2023'].map((x, i) => <a className="source-item" href="#source" key={x}><span className="source-number">{i + 1}</span><span><b>{x}</b><small>Health Department Reply</small></span><ChevronRight size={16} /></a>)}</div><button className="outline-button wide"><ExternalLink size={15} /> Open source documents</button></section>; }
function MlaPage({ setScreen, openQuestion }) {
  const [activeTab, setActiveTab] = useState('Recent Questions');
  const [selectedTopic, setSelectedTopic] = useState('');
  const mlaQuestions = useMemo(() => questions.filter((q) => !selectedTopic || q.category === selectedTopic), [selectedTopic]);

  return <section className="screen-pad">
    <TopBar title="MLAs" onBack={() => setScreen('home')} />
    <p className="page-intro">Select an MLA to view verified profile details and Assembly activity.</p>
    <div className="tabs" role="tablist" aria-label="MLA activity">
      {['Recent Questions', 'Topics'].map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}
    </div>
    {activeTab === 'Topics' ? <>
      <div className="chips topic-selector" aria-label="Select a topic">
        {topics.map((topic) => <button type="button" aria-pressed={selectedTopic === topic} className={selectedTopic === topic ? 'selected' : ''} key={topic} onClick={() => setSelectedTopic(selectedTopic === topic ? '' : topic)}>{topic}</button>)}
      </div>
      {selectedTopic ? (mlaQuestions.length ? mlaQuestions.map((q) => <button className="profile-question" key={q.id} onClick={() => openQuestion(q)}><span>Q.</span><span><b>{q.title}</b><small>{q.date} · {q.category}</small></span><ChevronRight size={15} /></button>) : <EmptyState text={`No verified MLA records are available for ${selectedTopic}.`} />) : <EmptyState text="Select a topic to view related verified MLA records." />}
    </> : <EmptyState text="No verified MLA profiles or questions are available right now." />}
  </section>;
}
function MorePage({ setScreen, language, setLanguage, dark, setDark, fontSize, setFontSize }) { const nextSize = () => setFontSize(fontSize === 'medium' ? 'large' : fontSize === 'large' ? 'small' : 'medium'); return <section className="screen-pad"><TopBar title="More" onBack={() => setScreen('home')} /><div className="guest-card"><span className="avatar guest-avatar"><UserRound size={22} /></span><span><b>Guest User</b><small>Sign in to save and bookmark</small></span><ChevronRight size={16} /></div><div className="settings-list"><Setting icon={<Search />} label="Saved Searches" onClick={() => setScreen('saved-searches')} /><Setting icon={<Bell />} label="Notifications" onClick={() => setScreen('notifications')} /><div className="setting-section">Settings</div><Setting icon={<Languages />} label="Language" value={language} onClick={() => setLanguage(language === 'EN' ? 'മലയാളം' : 'EN')} /><Setting icon={<span>◐</span>} label="Dark Mode" toggle value={dark} onClick={() => setDark(!dark)} /><Setting icon={<Settings />} label="Text Size" value={fontSize} onClick={nextSize} /><div className="setting-section">About this app</div><Setting icon={<Info />} label="About" onClick={() => setScreen('about')} /><Setting icon={<CircleHelp />} label="Help & Feedback" onClick={() => setScreen('help')} /></div></section>; }
function SavedQuestionsPage({ setScreen, saved, openQuestion }) { const savedQuestions = questions.filter((question) => saved.includes(question.id)); return <section className="screen-pad"><TopBar title="Saved Questions" onBack={() => setScreen('more')} />{savedQuestions.length ? <div className="results">{savedQuestions.map((question) => <QuestionCard key={question.id} question={question} onClick={() => openQuestion(question)} />)}</div> : <EmptyState text="You have no saved questions yet." />}</section>; }
function EmptyMenuPage({ title, message, setScreen }) { return <section className="screen-pad"><TopBar title={title} onBack={() => setScreen('more')} /><EmptyState text={message} /></section>; }
function HelpPage({ setScreen }) {
  const [feedback, setFeedback] = useState('');
  const [message, setMessage] = useState('');
  const shareFeedback = async (event) => {
    event.preventDefault();
    if (!feedback.trim()) { setMessage('Enter feedback before sharing.'); return; }
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Niyamasabha AI feedback', text: feedback.trim() });
        setMessage('Feedback shared.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(feedback.trim());
        setMessage('Feedback copied. You can paste it into a message.');
      } else {
        setMessage('Feedback sharing is not supported on this device.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') setMessage('Could not share feedback. Please try again.');
    }
  };
  return <section className="screen-pad"><TopBar title="Help & Feedback" onBack={() => setScreen('more')} /><div className="content-block"><h3>Using the app</h3><p>Use Home to see the latest verified Assembly updates, Search to find available records, Verify to check a claim, and MLAs to browse verified member information. Use More to change language, theme, and text size.</p></div><div className="content-block"><h3>Saved questions</h3><p>Save a question from its details screen. Your saved list is stored on this device. Question and MLA records are not currently connected, so some lists may be empty.</p></div><div className="content-block"><h3>Records and notifications</h3><p>Assembly updates and notifications will appear when verified records or a notification service are available.</p></div><form className="feedback-form" onSubmit={shareFeedback}><label className="field-label" htmlFor="feedback">Share feedback</label><textarea id="feedback" className="feedback-input" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Tell us what could be improved" rows={4} /><button type="submit" className="primary-button wide">Share feedback</button>{message && <p className="feedback-status" role="status">{message}</p>}</form></section>;
}
function AboutPage({ setScreen }) { return <section className="screen-pad"><TopBar title="About" onBack={() => setScreen('more')} /><div className="about-card"><img className="brand-mark logo-image" src="/images/kerala-state-emblem.png" alt="Kerala State Emblem" /><h2>Niyamasabha <span>AI</span></h2><p>Your window to Kerala Legislature</p></div><div className="content-block"><h3>About this app</h3><p>Niyamasabha AI is designed to help people explore Kerala Legislative Assembly questions, proceedings and public records.</p></div><div className="content-block"><h3>Data availability</h3><p>Verified Assembly question, MLA and update records are not currently connected. The app will show records here when a verified source is available.</p></div><div className="about-version">Version 0.1.0</div></section>; }
function Setting({ icon, label, value, onClick, toggle }) { return <button className="setting" onClick={onClick}><span className="setting-icon">{icon}</span><span>{label}</span>{toggle ? <span className={`switch ${value ? 'on' : ''}`}><i /></span> : <><small>{value}</small><ChevronRight size={16} /></>}</button>; }
function EmptyState({ text }) { return <div className="empty-state"><Search size={22} /><p>{text}</p></div>; }
