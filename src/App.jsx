import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Bookmark, BookmarkCheck, Check, ChevronRight, CircleHelp, ExternalLink, Filter, Globe2, Headphones, Home, Info, Languages, Mic, MoreHorizontal, Play, Search, Settings, Share2, Sparkles, UserRound, Users, X } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { assemblyImage, questions, topics } from './data';
import { apiFetch } from './services/api';

const nav = [{ id: 'home', label: 'Home', icon: Home }, { id: 'search', label: 'Search', icon: Search }, { id: 'verify', label: 'Verify', icon: Check }, { id: 'mla', label: 'MLAs', icon: Users }, { id: 'more', label: 'More', icon: MoreHorizontal }];
const LanguageContext = createContext('EN');
const malayalamUi = {
  Home: 'ഹോം', Search: 'തിരയുക', Verify: 'പരിശോധിക്കുക', MLAs: 'എം.എൽ.എമാർ', More: 'കൂടുതൽ',
  'Your window to Kerala Legislature': 'കേരള നിയമസഭയിലേക്കുള്ള നിങ്ങളുടെ ജാലകം', 'KERALA LEGISLATURE': 'കേരള നിയമസഭ', 'Serving the people of Kerala': 'കേരള ജനതയ്ക്കായി',
  'Search questions, MLAs, topics...': 'ചോദ്യങ്ങൾ, എം.എൽ.എമാർ, വിഷയങ്ങൾ തിരയുക...', 'Search in questions...': 'ചോദ്യങ്ങളിൽ തിരയുക...', 'Search Assembly records...': 'നിയമസഭാ രേഖകൾ തിരയുക...', 'Enter at least 2 characters to search records.': 'രേഖകൾ തിരയാൻ കുറഞ്ഞത് 2 അക്ഷരങ്ങൾ നൽകുക.', 'Searching official transcripts and MLA records…': 'ഔദ്യോഗിക ട്രാൻസ്ക്രിപ്റ്റുകളും എം.എൽ.എ രേഖകളും തിരയുന്നു…', 'Transcript matches': 'ട്രാൻസ്ക്രിപ്റ്റ് പൊരുത്തങ്ങൾ', 'MLA matches': 'എം.എൽ.എ പൊരുത്തങ്ങൾ', 'Open at': 'സമയത്ത് തുറക്കുക', 'No matching Assembly records found.': 'പൊരുത്തപ്പെടുന്ന നിയമസഭാ രേഖകളൊന്നും കണ്ടെത്തിയില്ല.', 'Assembly search is unavailable. Check that the backend is running.': 'നിയമസഭാ തിരയൽ ലഭ്യമല്ല. ബാക്കെൻഡ് പ്രവർത്തിക്കുന്നുണ്ടെന്ന് ഉറപ്പാക്കുക.', 'Assembly session': 'നിയമസഭാ സമ്മേളനം', 'Kerala Legislative Assembly': 'കേരള നിയമസഭ', 'Question Hour': 'ചോദ്യോത്തര വേള', 'Watch Now': 'ഇപ്പോൾ കാണുക',
  'Video summaries': 'വീഡിയോ സംഗ്രഹങ്ങൾ', 'Assembly video': 'നിയമസഭാ വീഡിയോ', 'transcript segments': 'ട്രാൻസ്ക്രിപ്റ്റ് ഭാഗങ്ങൾ', 'Show summary': 'സംഗ്രഹം കാണിക്കുക', 'Hide summary': 'സംഗ്രഹം മറയ്ക്കുക', 'Loading summary…': 'സംഗ്രഹം ലോഡ് ചെയ്യുന്നു…', 'Transcript summary · tap a sentence to view source timestamps.': 'ട്രാൻസ്ക്രിപ്റ്റ് സംഗ്രഹം · ഉറവിട സമയമുദ്രകൾ കാണാൻ വാക്യത്തിൽ അമർത്തുക.', 'Verify in the original video': 'യഥാർത്ഥ വീഡിയോയിൽ പരിശോധിക്കുക', 'Saved with this video’s transcript.': 'ഈ വീഡിയോയുടെ ട്രാൻസ്ക്രിപ്റ്റിനൊപ്പം സംരക്ഷിച്ചു.', 'No transcript videos are available yet.': 'ട്രാൻസ്ക്രിപ്റ്റുള്ള വീഡിയോകൾ ലഭ്യമല്ല.',
  'Assembly live session': 'നിയമസഭാ തത്സമയ സമ്മേളനം', 'Live stream': 'തത്സമയ സംപ്രേഷണം', 'The app cannot confirm an active live stream right now. Check the official Assembly webcast for the current broadcast.': 'ഇപ്പോൾ തത്സമയ സംപ്രേഷണം ലഭ്യമാണെന്ന് ആപ്പിന് സ്ഥിരീകരിക്കാനാകുന്നില്ല. നിലവിലെ സംപ്രേഷണത്തിനായി ഔദ്യോഗിക നിയമസഭാ വെബ്‌കാസ്റ്റ് പരിശോധിക്കുക.', 'Open official webcast': 'ഔദ്യോഗിക വെബ്‌കാസ്റ്റ് തുറക്കുക', 'Next scheduled live session': 'അടുത്തതായി നിശ്ചയിച്ച തത്സമയ സമ്മേളനം', 'No later sitting time is available in the currently published Assembly calendar. Check the official notices for the next announcement.': 'പ്രസിദ്ധീകരിച്ച നിയമസഭാ കലണ്ടറിൽ തുടർന്നുള്ള സമ്മേളന സമയം ലഭ്യമല്ല. അടുത്ത അറിയിപ്പിനായി ഔദ്യോഗിക അറിയിപ്പുകൾ പരിശോധിക്കുക.', 'Official sitting calendar': 'ഔദ്യോഗിക സമ്മേളന കലണ്ടർ', 'Session summons': 'സമ്മേളന അറിയിപ്പ്', 'at 9:00 AM IST. The session summons lists 9:00 AM as the meeting time; check the official notices or webcast in case the schedule changes.': 'രാവിലെ 9:00 IST-ന്. സമ്മേളന അറിയിപ്പിൽ രാവിലെ 9:00 ആണ് യോഗസമയം; മാറ്റങ്ങൾക്കായി ഔദ്യോഗിക അറിയിപ്പുകളോ വെബ്‌കാസ്റ്റോ പരിശോധിക്കുക.',
  'Trending topics': 'പ്രവണതയിലുള്ള വിഷയങ്ങൾ', 'Choose a topic to explore related Assembly questions.': 'ബന്ധപ്പെട്ട നിയമസഭാ ചോദ്യങ്ങൾ കാണാൻ ഒരു വിഷയം തിരഞ്ഞെടുക്കുക.', 'Select a topic to view related Assembly questions.': 'ബന്ധപ്പെട്ട നിയമസഭാ ചോദ്യങ്ങൾ കാണാൻ വിഷയം തിരഞ്ഞെടുക്കുക.', 'Select a topic to view related verified MLA records.': 'ബന്ധപ്പെട്ട സ്ഥിരീകരിച്ച എം.എൽ.എ രേഖകൾ കാണാൻ വിഷയം തിരഞ്ഞെടുക്കുക.', 'Select an MLA to view verified profile details and Assembly activity.': 'സ്ഥിരീകരിച്ച പ്രൊഫൈൽ വിവരങ്ങളും നിയമസഭാ പ്രവർത്തനങ്ങളും കാണാൻ ഒരു എം.എൽ.എയെ തിരഞ്ഞെടുക്കുക.', 'No questions match your search.': 'നിങ്ങളുടെ തിരയലിന് പൊരുത്തപ്പെടുന്ന ചോദ്യങ്ങളില്ല.', 'No verified MLA profiles or questions are available right now.': 'സ്ഥിരീകരിച്ച എം.എൽ.എ പ്രൊഫൈലുകളോ ചോദ്യങ്ങളോ ഇപ്പോൾ ലഭ്യമല്ല.', 'Recent Questions': 'സമീപകാല ചോദ്യങ്ങൾ', Topics: 'വിഷയങ്ങൾ', All: 'എല്ലാം', Questions: 'ചോദ്യങ്ങൾ', results: 'ഫലങ്ങൾ', Filter: 'ഫിൽട്ടർ',
  'Guest User': 'അതിഥി ഉപയോക്താവ്', 'Sign in to save and bookmark': 'സംരക്ഷിക്കാനും ബുക്ക്മാർക്ക് ചെയ്യാനും സൈൻ ഇൻ ചെയ്യുക', 'Saved Searches': 'സംരക്ഷിച്ച തിരയലുകൾ', Notifications: 'അറിയിപ്പുകൾ', Settings: 'ക്രമീകരണങ്ങൾ', Language: 'ഭാഷ', 'Dark Mode': 'ഡാർക്ക് മോഡ്', 'Text Size': 'അക്ഷര വലുപ്പം', 'About this app': 'ഈ ആപ്പിനെക്കുറിച്ച്', About: 'ആപ്പിനെക്കുറിച്ച്', 'Help & Feedback': 'സഹായവും അഭിപ്രായവും', 'You have no saved searches yet.': 'സംരക്ഷിച്ച തിരയലുകളൊന്നുമില്ല.', 'You have no notifications yet.': 'അറിയിപ്പുകളൊന്നുമില്ല.',
  'Question details': 'ചോദ്യത്തിന്റെ വിശദാംശങ്ങൾ', 'Original source': 'യഥാർത്ഥ ഉറവിടം', Question: 'ചോദ്യം', 'English translation': 'ഇംഗ്ലീഷ് വിവർത്തനം', 'Malayalam text': 'മലയാളം ഉള്ളടക്കം', 'Government reply': 'സർക്കാരിന്റെ മറുപടി', 'View Original Video': 'യഥാർത്ഥ വീഡിയോ കാണുക', 'Asked by': 'ചോദിച്ചത്', 'Save question': 'ചോദ്യം സംരക്ഷിക്കുക', Share: 'പങ്കിടുക',
  'Verify a claim': 'ഒരു അവകാശവാദം പരിശോധിക്കുക', 'Check political claims against available legislative records and reliable sources.': 'ലഭ്യമായ നിയമസഭാ രേഖകളും വിശ്വസനീയ ഉറവിടങ്ങളും ഉപയോഗിച്ച് രാഷ്ട്രീയ അവകാശവാദങ്ങൾ പരിശോധിക്കുക.', 'Enter a political claim or statement': 'രാഷ്ട്രീയ അവകാശവാദമോ പ്രസ്താവനയോ നൽകുക', 'e.g. “Government built 10 new hospitals in 2023”': 'ഉദാ: “2023-ൽ സർക്കാർ 10 പുതിയ ആശുപത്രികൾ നിർമ്മിച്ചു”', 'Voice input': 'ശബ്ദ ഇൻപുട്ട്', 'Verify Claim': 'അവകാശവാദം പരിശോധിക്കുക', 'Try these examples': 'ഈ ഉദാഹരണങ്ങൾ പരീക്ഷിക്കുക', 'We compare claims with available records. Results are informational and should be checked against original sources.': 'ലഭ്യമായ രേഖകളുമായി അവകാശവാദങ്ങൾ താരതമ്യം ചെയ്യുന്നു. ഫലങ്ങൾ വിവരാവശ്യത്തിനുള്ളതാണ്; യഥാർത്ഥ ഉറവിടങ്ങളിൽ പരിശോധിക്കുക.', 'Claim verification': 'അവകാശവാദ പരിശോധന', 'Partially supported': 'ഭാഗികമായി പിന്തുണയ്ക്കുന്നു', 'Based on available assembly records': 'ലഭ്യമായ നിയമസഭാ രേഖകളുടെ അടിസ്ഥാനത്തിൽ', 'AI summary': 'എ.ഐ. സംഗ്രഹം', 'The available records support part of this claim, but the wording includes details that could not be fully verified from the sources reviewed.': 'ലഭ്യമായ രേഖകൾ ഈ അവകാശവാദത്തിന്റെ ഒരു ഭാഗത്തെ പിന്തുണയ്ക്കുന്നു. പരിശോധിച്ച ഉറവിടങ്ങളിൽ ചില വിശദാംശങ്ങൾ പൂർണമായി സ്ഥിരീകരിക്കാനായില്ല.', 'Sources (3)': 'ഉറവിടങ്ങൾ (3)', 'Open source documents': 'ഉറവിട രേഖകൾ തുറക്കുക', 'Question Hour - 14 Mar 2023': 'ചോദ്യോത്തര വേള - 14 മാർച്ച് 2023', 'Government Press Release': 'സർക്കാർ പത്രക്കുറിപ്പ്', 'Budget Speech 2023': '2023 ബജറ്റ് പ്രസംഗം', 'Health Department Reply': 'ആരോഗ്യ വകുപ്പിന്റെ മറുപടി',
  'Saved Questions': 'സംരക്ഷിച്ച ചോദ്യങ്ങൾ', 'You have no saved questions yet.': 'സംരക്ഷിച്ച ചോദ്യങ്ങളൊന്നുമില്ല.', 'Using the app': 'ആപ്പ് ഉപയോഗിക്കുന്നത്', 'Saved questions': 'സംരക്ഷിച്ച ചോദ്യങ്ങൾ', 'Records and notifications': 'രേഖകളും അറിയിപ്പുകളും', 'Share feedback': 'അഭിപ്രായം പങ്കിടുക', 'Tell us what could be improved': 'എന്താണ് മെച്ചപ്പെടുത്തേണ്ടതെന്ന് അറിയിക്കുക', 'Feedback shared.': 'അഭിപ്രായം പങ്കിട്ടു.', 'Feedback copied. You can paste it into a message.': 'അഭിപ്രായം പകർത്തി. സന്ദേശത്തിൽ ഒട്ടിക്കാം.', 'Could not share feedback. Please try again.': 'അഭിപ്രായം പങ്കിടാനായില്ല. വീണ്ടും ശ്രമിക്കുക.', 'Feedback sharing is not supported on this device.': 'ഈ ഉപകരണത്തിൽ അഭിപ്രായം പങ്കിടൽ പിന്തുണയ്ക്കുന്നില്ല.', 'Enter feedback before sharing.': 'പങ്കിടുന്നതിന് മുമ്പ് അഭിപ്രായം നൽകുക.', 'Use Home to see the latest verified Assembly updates, Search to find available records, Verify to check a claim, and MLAs to browse verified member information. Use More to change language, theme, and text size.': 'ഏറ്റവും പുതിയ സ്ഥിരീകരിച്ച നിയമസഭാ വിവരങ്ങൾ കാണാൻ ഹോം, രേഖകൾ തിരയാൻ തിരയുക, അവകാശവാദം പരിശോധിക്കാൻ പരിശോധന, അംഗങ്ങളുടെ വിവരങ്ങൾക്ക് എം.എൽ.എമാർ എന്നിവ ഉപയോഗിക്കുക. ഭാഷ, തീം, അക്ഷര വലുപ്പം എന്നിവ മാറ്റാൻ കൂടുതൽ തുറക്കുക.', 'Save a question from its details screen. Your saved list is stored on this device. Question and MLA records are not currently connected, so some lists may be empty.': 'ചോദ്യത്തിന്റെ വിശദാംശങ്ങളിൽ നിന്ന് അത് സംരക്ഷിക്കാം. സംരക്ഷിച്ച പട്ടിക ഈ ഉപകരണത്തിൽ സൂക്ഷിക്കും. ചോദ്യ/എം.എൽ.എ രേഖകൾ ഇപ്പോൾ ബന്ധിപ്പിച്ചിട്ടില്ലാത്തതിനാൽ ചില പട്ടികകൾ ശൂന്യമായിരിക്കാം.', 'Assembly updates and notifications will appear when verified records or a notification service are available.': 'സ്ഥിരീകരിച്ച രേഖകളോ അറിയിപ്പ് സേവനമോ ലഭ്യമാകുമ്പോൾ നിയമസഭാ വിവരങ്ങളും അറിയിപ്പുകളും ഇവിടെ കാണിക്കും.', 'Niyamasabha AI is designed to help people explore Kerala Legislative Assembly questions, proceedings and public records.': 'കേരള നിയമസഭയിലെ ചോദ്യങ്ങൾ, നടപടികൾ, പൊതുരേഖകൾ എന്നിവ അറിയാൻ സഹായിക്കുന്നതിനാണ് നിയമസഭ AI രൂപകൽപ്പന ചെയ്തിരിക്കുന്നത്.', 'Data availability': 'ഡാറ്റ ലഭ്യത', 'Verified Assembly question, MLA and update records are not currently connected. The app will show records here when a verified source is available.': 'സ്ഥിരീകരിച്ച നിയമസഭാ ചോദ്യങ്ങൾ, എം.എൽ.എ വിവരങ്ങൾ, പുതുക്കലുകൾ എന്നിവയുമായി ഇപ്പോൾ ബന്ധിപ്പിച്ചിട്ടില്ല. സ്ഥിരീകരിച്ച ഉറവിടം ലഭ്യമാകുമ്പോൾ ഇവിടെ കാണിക്കും.',
  Small: 'ചെറുത്', Medium: 'ഇടത്തരം', Large: 'വലുത്', small: 'ചെറുത്', medium: 'ഇടത്തരം', large: 'വലുത്', Version: 'പതിപ്പ്', 'Kerala State Emblem': 'കേരള സംസ്ഥാന ചിഹ്നം', 'No verified Assembly updates are available right now.': 'സ്ഥിരീകരിച്ച നിയമസഭാ വിവരങ്ങൾ ഇപ്പോൾ ലഭ്യമല്ല.', 'Summary is being generated or is not available yet.': 'സംഗ്രഹം തയ്യാറാക്കുന്നു അല്ലെങ്കിൽ ഇപ്പോൾ ലഭ്യമല്ല.', 'Could not load the saved summary.': 'സംരക്ഷിച്ച സംഗ്രഹം ലോഡ് ചെയ്യാനായില്ല.', 'Could not summarize this transcript. Please try again later.': 'ഈ ട്രാൻസ്ക്രിപ്റ്റ് സംഗ്രഹിക്കാനായില്ല. പിന്നീട് വീണ്ടും ശ്രമിക്കുക.', 'Members of the Kerala Legislative Assembly': 'കേരള നിയമസഭയിലെ അംഗങ്ങൾ', 'member count': 'അംഗങ്ങളുടെ എണ്ണം', 'Loading members…': 'അംഗങ്ങളെ ലോഡ് ചെയ്യുന്നു…', 'Could not load official member photos.': 'ഔദ്യോഗിക അംഗങ്ങളുടെ ചിത്രങ്ങൾ ലോഡ് ചെയ്യാനായില്ല.', 'Open official member list': 'ഔദ്യോഗിക അംഗപ്പട്ടിക തുറക്കുക', 'No official portrait available': 'ഔദ്യോഗിക ചിത്രം ലഭ്യമല്ല', 'No verified Assembly questions are available for Education yet.': 'വിദ്യാഭ്യാസവുമായി ബന്ധപ്പെട്ട സ്ഥിരീകരിച്ച നിയമസഭാ ചോദ്യങ്ങളില്ല.', 'No verified Assembly questions are available for Health yet.': 'ആരോഗ്യവുമായി ബന്ധപ്പെട്ട സ്ഥിരീകരിച്ച നിയമസഭാ ചോദ്യങ്ങളില്ല.', 'No verified Assembly questions are available for Infrastructure yet.': 'അടിസ്ഥാന സൗകര്യവുമായി ബന്ധപ്പെട്ട സ്ഥിരീകരിച്ച നിയമസഭാ ചോദ്യങ്ങളില്ല.', 'No verified Assembly questions are available for Employment yet.': 'തൊഴിൽ വിഷയത്തിൽ സ്ഥിരീകരിച്ച നിയമസഭാ ചോദ്യങ്ങളില്ല.', 'No verified MLA records are available for Education.': 'വിദ്യാഭ്യാസ വിഷയത്തിൽ സ്ഥിരീകരിച്ച എം.എൽ.എ രേഖകളില്ല.', 'No verified MLA records are available for Health.': 'ആരോഗ്യ വിഷയത്തിൽ സ്ഥിരീകരിച്ച എം.എൽ.എ രേഖകളില്ല.', 'No verified MLA records are available for Infrastructure.': 'അടിസ്ഥാന സൗകര്യവുമായി ബന്ധപ്പെട്ട സ്ഥിരീകരിച്ച എം.എൽ.എ രേഖകളില്ല.', 'No verified MLA records are available for Employment.': 'തൊഴിൽ വിഷയത്തിൽ സ്ഥിരീകരിച്ച എം.എൽ.എ രേഖകളില്ല.', 'Education': 'വിദ്യാഭ്യാസം', Health: 'ആരോഗ്യം', Infrastructure: 'അടിസ്ഥാന സൗകര്യം', Employment: 'തൊഴിൽ'
};
function useT() {
  const language = useContext(LanguageContext);
  return (text) => language === 'EN' ? text : (malayalamUi[text] || text);
}
function stored(key, initial) { const [value, setValue] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) ?? initial; } catch { return initial; } }); useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]); return [value, setValue]; }

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [language, setLanguage] = stored('language', 'EN'); const [dark, setDark] = stored('dark-mode', false); const [fontSize, setFontSize] = stored('font-size', 'medium'); const [saved, setSaved] = stored('saved-questions', []); const [selected, setSelected] = useState(questions[0]); const [claim, setClaim] = useState(''); const [result, setResult] = useState(null);
  const [splash, setSplash] = useState(() => !sessionStorage.getItem('niyamasabha-splash-shown'));
  const t = (text) => language === 'EN' ? text : (malayalamUi[text] || text);
  const screen = location.pathname.slice(1) || 'home';
  const setScreen = (next, options) => navigate(`/${next}`, options);
  useEffect(() => document.body.setAttribute('data-theme', dark ? 'dark' : 'light'), [dark]); useEffect(() => document.body.setAttribute('data-font', fontSize), [fontSize]); useEffect(() => { document.documentElement.lang = language === 'EN' ? 'en' : 'ml'; }, [language]);
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
      const exitPrompt = language === 'EN' ? 'Do you want to exit Niyamasabha AI?' : 'നിയമസഭ AI-യിൽ നിന്ന് പുറത്തുകടക്കണോ?';
      if (location.pathname === '/home' && !window.confirm(exitPrompt)) {
        event.preventDefault();
        window.history.pushState({}, '', '/home');
      }
    };
    window.addEventListener('popstate', handleBrowserBack);
    return () => window.removeEventListener('popstate', handleBrowserBack);
  }, [language, location.pathname]);
  const shared = { language, setLanguage, setScreen, goBack: () => navigate(-1), saved, toggleSaved: (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]), openQuestion: (q) => { setSelected(q); setScreen('question', { state: { questionId: q.id } }); }, dark, setDark, fontSize, setFontSize };
  const submit = (e) => { e.preventDefault(); if (claim.trim()) { setResult({ claim: claim.trim() }); setScreen('verification'); } };
  if (splash) return <LanguageContext.Provider value={language}><div className="app-shell splash-shell"><main className="app-main"><Welcome /></main></div></LanguageContext.Provider>;
  return <LanguageContext.Provider value={language}><div className="app-shell" lang={language === 'EN' ? 'en' : 'ml'}><main className="app-main">
    {screen === 'home' && <HomePage {...shared} />}{screen === 'search' && <SearchPage {...shared} />}{screen === 'topics' && <TopicsPage {...shared} />}{screen === 'all-summaries' && <AllVideoSummariesPage {...shared} />}{screen === 'live' && <LivePage setScreen={setScreen} />}{screen === 'question' && <QuestionPage {...shared} question={selected} />}{screen === 'verify' && <VerifyPage {...shared} claim={claim} setClaim={setClaim} onSubmit={submit} />}{screen === 'verification' && <VerificationPage {...shared} result={result} />}{screen === 'mla' && <MlaPage {...shared} />}{screen === 'more' && <MorePage {...shared} />}{screen === 'about' && <AboutPage setScreen={setScreen} />}{screen === 'saved-questions' && <SavedQuestionsPage {...shared} />}{screen === 'saved-searches' && <EmptyMenuPage title="Saved Searches" message="You have no saved searches yet." setScreen={setScreen} />}{screen === 'notifications' && <EmptyMenuPage title="Notifications" message="You have no notifications yet." setScreen={setScreen} />}{screen === 'help' && <HelpPage setScreen={setScreen} />}
  </main>{screen !== 'welcome' && <nav className="bottom-nav">{nav.map(({ id, label, icon: Icon }) => <button className={screen === id ? 'active' : ''} key={id} onClick={() => setScreen(id)}><Icon size={19} /><span>{t(label)}</span></button>)}</nav>}</div></LanguageContext.Provider>;
}
function Brand({ language, setLanguage }) {
  const t = useT();
  return (
    <div className="brand">
      <img className="brand-mark logo-image" src="/images/kerala-state-emblem.png" alt="Kerala State Emblem" />
      <div className="brand-text">
        <strong>Niyamasabha <span>AI</span></strong>
        <small>{t('Your window to Kerala Legislature')}</small>
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
function TopBar({ title, onBack, actions }) { const t = useT(); return <header className="topbar">{onBack && <button className="icon-button" onClick={onBack}><ArrowLeft size={19} /></button>}<h1>{t(title)}</h1><div className="top-actions">{actions}</div></header>; }
function Welcome() {
  const t = useT();
  return (
    <section className="welcome">
      <div className="welcome-copy">
        <p className="eyebrow">{t('KERALA LEGISLATURE')}</p>
        <h1>Niyamasabha <span>AI</span></h1>
        <p className="lead">{t('Your window to Kerala Legislature')}</p>
      </div>
      <div className="welcome-image">
        <div className="welcome-photo-container">
          <img src={assemblyImage} alt="Kerala Legislative Assembly building" />
          <div className="welcome-photo-overlay" />
        </div>
      </div>
      <div className="welcome-footer">
        <p className="welcome-tagline">{t('Serving the people of Kerala')}</p>
      </div>
    </section>
  );
}
function HomePage({ language, setLanguage, setScreen }) {
  const t = useT();
  return (
    <section className="screen-pad">
      <div className="page-header">
        <Brand language={language} setLanguage={setLanguage} />
        <button type="button" className="icon-button" aria-label={t('Notifications')}>
          <Bell size={19} />
        </button>
      </div>

      <button type="button" className="search-box" onClick={() => setScreen('search')}>
        <Search size={17} />
          <span>{t('Search questions, MLAs, topics...')}</span>
        <Mic size={17} />
      </button>

      <div className="session-card">
        <img src={assemblyImage} alt="Kerala Legislative Assembly" />
        <div className="session-overlay">
          <span className="live-pill">{t('Assembly session')}</span>
          <small>{t('Kerala Legislative Assembly')}</small>
          <strong>{t('Question Hour')}</strong>
          <button type="button" className="watch-button" onClick={() => setScreen('live')}>
            <Play size={12} fill="currentColor" /> {t('Watch Now')}
          </button>
        </div>
      </div>

      <VideoSummarySection setScreen={setScreen} />
    </section>
  );
}
function VideoSummarySection({ allVideos = false, setScreen }) {
  const t = useT();
  const language = useContext(LanguageContext);
  const [videos, setVideos] = useState([]);
  const [message, setMessage] = useState('');
  const translationAttempts = useRef(new Set());
  const friendlyError = (error) => error.message.includes('Backend is not configured')
    ? t('Set VITE_API_BASE_URL to a backend address this device can reach.')
    : t(error.message);
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
  useEffect(() => {
    let active = true;
    const needsTranslation = videos.filter((video) => language === 'EN'
      ? !video.title_english
      : !video.summary?.sentences?.length).slice(0, 10)
      .filter((video) => !translationAttempts.current.has(`${language}:${video.video_id}`));
    if (!needsTranslation.length) return undefined;
    needsTranslation.forEach((video) => translationAttempts.current.add(`${language}:${video.video_id}`));
    Promise.all(needsTranslation.map(async (video) => {
      try {
        const apiLanguage = language === 'EN' ? 'en' : 'ml';
        const data = await apiFetch(`/api/videos/${encodeURIComponent(video.video_id)}/summary?language=${apiLanguage}`, { method: 'POST' });
        return { video, data };
      } catch {
        return null;
      }
    })).then((updates) => {
      if (!active) return;
      if (!updates.some(Boolean)) return;
      setVideos((current) => current.map((video) => {
        const update = updates.find((item) => item?.video.video_id === video.video_id);
        if (!update) return video;
        const summaryKey = language === 'EN' ? 'summary_english' : 'summary';
        return { ...video, title_english: update.data.title_english || video.title_english,
          [summaryKey]: update.data };
      }));
    });
    return () => { active = false; };
  }, [language, videos]);
  return <section className="video-summaries" aria-labelledby="video-summaries-title">
    <div className="section-heading"><h2 className="section-title" id="video-summaries-title">{t('Video summaries')}</h2></div>
    {videos.length > 0 ? <div className="video-summary-list">{videos.map((video) => <article className="video-summary-card" key={video.video_id}>
      <div className="video-summary-meta">{formatVideoDate(video.published_at, language)} · {video.segment_count} {t('transcript segments')}</div>
      <h3>{language === 'EN' && video.title_english ? video.title_english : video.title}</h3>
      <VideoSummaryPanel video={video} onVideoUpdated={(data) => setVideos((current) => current.map((item) => item.video_id === video.video_id ? { ...item, title_english: data.title_english || item.title_english, [language === 'EN' ? 'summary_english' : 'summary']: data } : item))} />
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
  const t = useT();
  const language = useContext(LanguageContext);
  const nextSitting = [26, 27, 28, 29]
    .map((day) => new Date(`2026-10-${day}T09:00:00+05:30`))
    .find((date) => date.getTime() > Date.now());
  const nextSittingLabel = nextSitting && new Intl.DateTimeFormat(language === 'EN' ? 'en-IN' : 'ml-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(nextSitting);
  return <section className="screen-pad">
    <TopBar title="Assembly live session" onBack={() => setScreen('home')} />
    <div className="content-block live-status-card">
      <h3>{t('Live stream')}</h3>
      <p>{t('The app cannot confirm an active live stream right now. Check the official Assembly webcast for the current broadcast.')}</p>
      <a className="outline-button wide live-source-link" href="https://ondemandwebcast.niyamasabha.org/" target="_blank" rel="noreferrer">
        {t('Open official webcast')} <ExternalLink size={15} />
      </a>
    </div>
    <div className="content-block">
      <h3>{t('Next scheduled live session')}</h3>
      {nextSitting ? <p>{nextSittingLabel} · {t('at 9:00 AM IST. The session summons lists 9:00 AM as the meeting time; check the official notices or webcast in case the schedule changes.')}</p>
        : <p>{t('No later sitting time is available in the currently published Assembly calendar. Check the official notices for the next announcement.')}</p>}
      <div className="live-source-links">
        <a className="live-calendar-link" href="https://www.niyamasabha.org/codes/16kla/session_2/2%20Session%20Calender%20.pdf" target="_blank" rel="noreferrer">
          {t('Official sitting calendar')} <ExternalLink size={14} />
        </a>
        <a className="live-calendar-link" href="https://www.niyamasabha.org/codes/16kla/session_2/Notification%20-%20Summons%20-%20Second%20Session.pdf" target="_blank" rel="noreferrer">
          {t('Session summons')} <ExternalLink size={14} />
        </a>
      </div>
    </div>
  </section>;
}
function VideoSummaryPanel({ video, onVideoUpdated }) {
  const t = useT();
  const language = useContext(LanguageContext);
  const [open, setOpen] = useState(false);
  const [loadedSummaries, setLoadedSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedSentence, setExpandedSentence] = useState(null);
  const summary = loadedSummaries[language] || (language === 'EN' ? video.summary_english : video.summary) || null;
  const toggleSummary = async () => {
    if (open) { setOpen(false); return; }
    if (!summary?.sentences?.length || (language === 'EN' && !video.title_english)) {
      setLoading(true);
      setError('');
      try {
        const apiLanguage = language === 'EN' ? 'en' : 'ml';
        const data = await apiFetch(`/api/videos/${encodeURIComponent(video.video_id)}/summary?language=${apiLanguage}`, { method: 'POST' });
        setLoadedSummaries((current) => ({ ...current, [language]: data }));
        onVideoUpdated?.(data);
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
      {loading ? t('Loading summary…') : open ? t('Hide summary') : t('Show summary')}
      <ChevronRight size={16} />
    </button>
    {error && <p className="video-summary-status" role="status">{t(error)}</p>}
    {open && summary?.sentences?.length > 0 && <div className="summary-panel">
      <p className="summary-help">{t('Transcript summary · tap a sentence to view source timestamps.')}</p>
      <p className="summary-paragraph">{summary.sentences.map((item, index) => <span className="summary-sentence-wrap" key={`${index}-${item.text}`}>
        <button type="button" className="summary-sentence" aria-expanded={expandedSentence === index} onClick={() => setExpandedSentence(expandedSentence === index ? null : index)}>{item.text}</button>{' '}
        {expandedSentence === index && <span className="summary-citations" role="dialog" aria-label="Source timestamps">
          <span>{t('Verify in the original video')}</span>
          {(item.citations || []).map((citation) => <a key={citation.segment_id} href={`https://www.youtube.com/watch?v=${encodeURIComponent(summary.video_id)}&t=${Math.floor(citation.start_seconds)}s`} target="_blank" rel="noreferrer">
            {formatTimestamp(citation.start_seconds)} <ExternalLink size={13} />
          </a>)}
        </span>}
      </span>)}</p>
      <small className="summary-saved-note">{t('Saved with this video’s transcript.')}</small>
    </div>}
  </div>;
}
function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function formatVideoDate(value, language = 'EN') {
  if (!value) return 'Assembly video';
  const normalized = /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 'Assembly video' : date.toLocaleDateString(language === 'EN' ? 'en-IN' : 'ml-IN');
}
function SearchPage({ setScreen }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('All');
  const [transcripts, setTranscripts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const language = useContext(LanguageContext);
  const tr = useT();
  useEffect(() => {
    const searchTerm = query.trim();
    if (searchTerm.length < 2) {
      setTranscripts([]);
      setMembers([]);
      setLoading(false);
      setError(false);
      return undefined;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const requests = [];
        if (tab !== 'MLAs') requests.push(apiFetch(`/api/search?q=${encodeURIComponent(searchTerm)}&limit=30`));
        else requests.push(Promise.resolve({ results: [] }));
        if (tab === 'All' || tab === 'MLAs') requests.push(apiFetch('/api/members'));
        else requests.push(Promise.resolve({ members: [] }));
        const [transcriptData, memberData] = await Promise.all(requests);
        if (!active) return;
        setTranscripts(Array.isArray(transcriptData.results) ? transcriptData.results : []);
        const memberRecords = Array.isArray(memberData.members) ? memberData.members : [];
        const normalizedQuery = searchTerm.toLocaleLowerCase();
        setMembers(memberRecords.filter((member) =>
          `${member.name} ${member.constituency}`.toLocaleLowerCase().includes(normalizedQuery)
        ));
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [query, tab]);

  const formatTimestamp = (value) => {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const timestampUrl = (record) => {
    try {
      const url = new URL(record.url);
      url.searchParams.set('t', String(Math.floor(Number(record.start_seconds) || 0)));
      return url.toString();
    } catch { return record.url; }
  };
  const resultCount = (tab === 'MLAs' ? members.length : transcripts.length)
    + (tab === 'All' ? members.length : 0);
  return <section className="screen-pad">
    <TopBar title="Search" onBack={() => setScreen('home')} />
    <div className="search-box filled"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search Assembly records...')} /><button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button></div>
    <div className="tabs">{['All', 'Questions', 'MLAs', 'Topics'].map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{tr(item)}</button>)}</div>
    {query.trim().length < 2 ? <EmptyState text="Enter at least 2 characters to search records." /> : <>
      {loading && <p className="search-status" role="status">{tr('Searching official transcripts and MLA records…')}</p>}
      {error && <p className="search-status" role="alert">{tr('Assembly search is unavailable. Check that the backend is running.')}</p>}
      {!loading && !error && <div className="result-count">{resultCount} {tr('results')}</div>}
      {tab !== 'MLAs' && transcripts.length > 0 && <>
        <h2 className="section-title">{tr('Transcript matches')}</h2>
        <div className="results">{transcripts.map((record, index) => <article className="search-record-card" key={`${record.video_id}-${record.start_seconds}-${index}`}>
          <small>{tr('Assembly video')}{record.published_at ? ` · ${record.published_at}` : ''}</small>
          <h3>{language === 'EN' ? (record.title_english || record.title) : record.title}</h3>
          <p>{language === 'EN' ? (record.text_english || record.text) : record.text}</p>
          <a href={timestampUrl(record)} target="_blank" rel="noreferrer">{tr('Open at')} {formatTimestamp(record.start_seconds)} <ExternalLink size={14} /></a>
        </article>)}</div>
      </>}
      {(tab === 'All' || tab === 'MLAs') && members.length > 0 && <>
        <h2 className="section-title">{tr('MLA matches')}</h2>
        <div className="search-member-grid">{members.map((member) => <article className="search-member-card" key={member.constituency_number}>
          <div className="member-photo-wrap"><span className="member-initials">{member.name.split(/\s+/).filter((part) => !/^(Shri|Smt\.?|Miss\.?|Prof\.?|Dr\.?)$/i.test(part)).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>{member.image_url && <img className="member-photo" src={member.image_url} alt={member.name} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div>
          <strong>{member.name}</strong><small>{member.constituency}</small>
        </article>)}</div>
      </>}
      {!loading && !error && resultCount === 0 && <EmptyState text="No matching Assembly records found." />}
    </>}
  </section>;
}
function TopicsPage({ setScreen, openQuestion }) {
  const tr = useT();
  const location = useLocation();
  const [selectedTopic, setSelectedTopic] = useState(location.state?.topic || '');
  const relatedQuestions = useMemo(() => questions.filter((question) =>
    !selectedTopic || question.category === selectedTopic || question.tags?.includes(selectedTopic)
  ), [selectedTopic]);
  return <section className="screen-pad">
    <TopBar title="Trending topics" onBack={() => setScreen('home')} />
    <p className="page-intro">{tr('Choose a topic to explore related Assembly questions.')}</p>
    <div className="chips topic-selector" aria-label="Trending topics">
      {topics.map((topic) => <button type="button" aria-pressed={selectedTopic === topic} className={selectedTopic === topic ? 'selected' : ''} key={topic} onClick={() => setSelectedTopic(selectedTopic === topic ? '' : topic)}>{tr(topic)}</button>)}
    </div>
    {selectedTopic && <><h2 className="section-title">{selectedTopic}</h2>{relatedQuestions.length
      ? <div className="results">{relatedQuestions.map((question) => <QuestionCard key={question.id} question={question} onClick={() => openQuestion(question)} />)}</div>
      : <EmptyState text={`No verified Assembly questions are available for ${selectedTopic} yet.`} />}</>}
    {!selectedTopic && <EmptyState text="Select a topic to view related Assembly questions." />}
  </section>;
}
function QuestionCard({ question, onClick }) { const tr = useT(); return <button className="question-card" onClick={onClick}><div className="card-top"><span className="category-icon"><Search size={14} /></span><div><strong>{question.title}</strong><small>{question.date} · {tr(question.session)}</small></div><ChevronRight size={17} /></div><p>{question.preview}</p><div className="mla-row"><span className="avatar small">SP</span><small>{tr('Asked by')} <b>{question.mla}</b></small></div><div className="chips">{question.tags.map((tag) => <span key={tag}>{tr(tag)}</span>)}</div></button>; }
function QuestionPage({ setScreen, question, saved, toggleSaved }) { const tr = useT(); const lang = useContext(LanguageContext); const share = () => navigator.share ? navigator.share({ title: question.title, url: location.href }) : navigator.clipboard?.writeText(question.title); return <section className="screen-pad"><TopBar title="Question details" onBack={() => setScreen('search')} actions={<><button className="icon-button" aria-label={tr('Save question')} onClick={() => toggleSaved(question.id)}>{saved.includes(question.id) ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button><button className="icon-button" aria-label={tr('Share')} onClick={share}><Share2 size={18} /></button></>} /><div className="detail-heading"><span className="category-label">{tr(question.category)} · {tr('Question Hour')}</span><h1>{question.title}</h1><small>{question.date}</small></div><div className="person-card"><span className="avatar">SP</span><div><small>{tr('Asked by')}</small><strong>{question.mla}</strong><small>{question.party}</small></div><span className="verified-dot"><Check size={12} /></span></div><Content title="Question" tag="Original source">{lang === 'EN' ? (question.english || question.malayalam) : question.malayalam}</Content>{lang === 'EN' ? <Content title="English translation">{question.english || 'Will the government consider setting up a super speciality hospital in Kochi to improve access to advanced care?'}</Content> : <Content title="Malayalam text">{question.malayalam}</Content>}<Content title="Government reply">{lang === 'EN' ? (question.reply_english || question.reply) : (question.reply_malayalam || question.reply)}</Content><button className="video-card"><span className="play-circle"><Play size={16} fill="currentColor" /></span><span><b>{tr('View Original Video')}</b><small>00:42:15 - 00:45:30</small></span><ExternalLink size={16} /></button><div className="detail-tags">{question.tags.map((tag) => <span key={tag}>{tr(tag)}</span>)}</div></section>; }
function Content({ title, tag, children }) { const tr = useT(); return <div className="content-block"><h3>{tr(title)}{tag && <span>{tr(tag)}</span>}</h3><p>{typeof children === 'string' ? tr(children) : children}</p></div>; }
function VerifyPage({ setScreen, claim, setClaim, onSubmit }) { const tr = useT(); return <section className="screen-pad"><TopBar title="Verify a claim" onBack={() => setScreen('home')} /><p className="page-intro">{tr('Check political claims against available legislative records and reliable sources.')}</p><form onSubmit={onSubmit}><label className="field-label" htmlFor="claim">{tr('Enter a political claim or statement')}</label><div className="claim-field"><textarea id="claim" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder={tr('e.g. “Government built 10 new hospitals in 2023”')} maxLength={300} /><button className="mic-button" type="button" aria-label={tr('Voice input')}><Mic size={17} /></button></div><div className="char-count">{claim.length}/300</div><button className="primary-button wide">{tr('Verify Claim')} <ArrowRight size={17} /></button></form><h2 className="section-title">{tr('Try these examples')}</h2><div className="examples">{['Government reduced unemployment in Kerala', '50,000 new housing units', 'No new taxes introduced this year'].map((x) => <button key={x} onClick={() => setClaim(x)}><Search size={14} /> {tr(x)}</button>)}</div><div className="info-box"><Sparkles size={17} /><p>{tr('We compare claims with available records. Results are informational and should be checked against original sources.')}</p></div></section>; }
function VerificationPage({ setScreen, result }) { const tr = useT(); return <section className="screen-pad"><TopBar title="Claim verification" onBack={() => setScreen('verify')} /><div className="claim-summary"><span>Q.</span><strong>“{result?.claim}”</strong></div><div className="verdict"><div className="verdict-icon"><Check size={23} /></div><div><span>{tr('Partially supported')}</span><small>{tr('Based on available assembly records')}</small></div><b>72%</b></div><div className="confidence"><span /></div><div className="ai-summary"><h3><Sparkles size={16} /> {tr('AI summary')}</h3><p>{tr('The available records support part of this claim, but the wording includes details that could not be fully verified from the sources reviewed.')}</p></div><h2 className="section-title">{tr('Sources (3)')}</h2><div className="source-list">{['Question Hour - 14 Mar 2023', 'Government Press Release', 'Budget Speech 2023'].map((x, i) => <a className="source-item" href="#source" key={x}><span className="source-number">{i + 1}</span><span><b>{tr(x)}</b><small>{tr('Health Department Reply')}</small></span><ChevronRight size={16} /></a>)}</div><button className="outline-button wide"><ExternalLink size={15} /> {tr('Open source documents')}</button></section>; }
function MlaPage({ setScreen }) {
  const tr = useT();
  const [directory, setDirectory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch('/api/members')
      .then((data) => { if (active) { setDirectory(data); setError(false); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const getInitials = (name) => name.replace(/^(Shri|Smt\.?|Miss\.?|Prof\.?|Dr\.?|DR\.?)+\s*/i, '').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <section className="screen-pad">
    <TopBar title="MLAs" onBack={() => setScreen('home')} />
    <div className="member-count-card">
      <div><h2>{tr('Members of the Kerala Legislative Assembly')}</h2><small>{tr('member count')}</small></div>
      <strong>{directory?.count ?? '—'}</strong>
    </div>
    {loading && <p className="member-directory-status">{tr('Loading members…')}</p>}
    {error && !directory && <p className="member-directory-status" role="status">{tr('Could not load official member photos.')}</p>}
    {directory?.members?.length > 0 && <div className="member-grid">
      {directory.members.map((member) => <article className="member-card" key={member.constituency_number}>
        <div className="member-photo-wrap"><span className="member-initials">{getInitials(member.name)}</span>{member.image_url && <img className="member-photo" src={member.image_url} alt={member.name} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}</div>
        <strong>{member.name}</strong>
        <small>{member.constituency}</small>
      </article>)}
    </div>}
  </section>;
}
function MorePage({ setScreen, language, setLanguage, dark, setDark, fontSize, setFontSize }) { const tr = useT(); const nextSize = () => setFontSize(fontSize === 'medium' ? 'large' : fontSize === 'large' ? 'small' : 'medium'); return <section className="screen-pad"><TopBar title="More" onBack={() => setScreen('home')} /><div className="guest-card"><span className="avatar guest-avatar"><UserRound size={22} /></span><span><b>{tr('Guest User')}</b><small>{tr('Sign in to save and bookmark')}</small></span><ChevronRight size={16} /></div><div className="settings-list"><Setting icon={<Search />} label="Saved Searches" onClick={() => setScreen('saved-searches')} /><Setting icon={<Bell />} label="Notifications" onClick={() => setScreen('notifications')} /><div className="setting-section">{tr('Settings')}</div><Setting icon={<Languages />} label="Language" value={language} onClick={() => setLanguage(language === 'EN' ? 'മലയാളം' : 'EN')} /><Setting icon={<span>◐</span>} label="Dark Mode" toggle value={dark} onClick={() => setDark(!dark)} /><Setting icon={<Settings />} label="Text Size" value={fontSize} onClick={nextSize} /><div className="setting-section">{tr('About this app')}</div><Setting icon={<Info />} label="About" onClick={() => setScreen('about')} /><Setting icon={<CircleHelp />} label="Help & Feedback" onClick={() => setScreen('help')} /></div></section>; }
function SavedQuestionsPage({ setScreen, saved, openQuestion }) { const savedQuestions = questions.filter((question) => saved.includes(question.id)); return <section className="screen-pad"><TopBar title="Saved Questions" onBack={() => setScreen('more')} />{savedQuestions.length ? <div className="results">{savedQuestions.map((question) => <QuestionCard key={question.id} question={question} onClick={() => openQuestion(question)} />)}</div> : <EmptyState text="You have no saved questions yet." />}</section>; }
function EmptyMenuPage({ title, message, setScreen }) { return <section className="screen-pad"><TopBar title={title} onBack={() => setScreen('more')} /><EmptyState text={message} /></section>; }
function HelpPage({ setScreen }) {
  const tr = useT();
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
  return <section className="screen-pad"><TopBar title="Help & Feedback" onBack={() => setScreen('more')} /><div className="content-block"><h3>{tr('Using the app')}</h3><p>{tr('Use Home to see the latest verified Assembly updates, Search to find available records, Verify to check a claim, and MLAs to browse verified member information. Use More to change language, theme, and text size.')}</p></div><div className="content-block"><h3>{tr('Saved questions')}</h3><p>{tr('Save a question from its details screen. Your saved list is stored on this device. Question and MLA records are not currently connected, so some lists may be empty.')}</p></div><div className="content-block"><h3>{tr('Records and notifications')}</h3><p>{tr('Assembly updates and notifications will appear when verified records or a notification service are available.')}</p></div><form className="feedback-form" onSubmit={shareFeedback}><label className="field-label" htmlFor="feedback">{tr('Share feedback')}</label><textarea id="feedback" className="feedback-input" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder={tr('Tell us what could be improved')} rows={4} /><button type="submit" className="primary-button wide">{tr('Share feedback')}</button>{message && <p className="feedback-status" role="status">{tr(message)}</p>}</form></section>;
}
function AboutPage({ setScreen }) { const tr = useT(); return <section className="screen-pad"><TopBar title="About" onBack={() => setScreen('more')} /><div className="about-card"><img className="brand-mark logo-image" src="/images/kerala-state-emblem.png" alt={tr('Kerala State Emblem')} /><h2>Niyamasabha <span>AI</span></h2><p>{tr('Your window to Kerala Legislature')}</p></div><div className="content-block"><h3>{tr('About this app')}</h3><p>{tr('Niyamasabha AI is designed to help people explore Kerala Legislative Assembly questions, proceedings and public records.')}</p></div><div className="content-block"><h3>{tr('Data availability')}</h3><p>{tr('Verified Assembly question, MLA and update records are not currently connected. The app will show records here when a verified source is available.')}</p></div><div className="about-version">{tr('Version')} 0.1.0</div></section>; }
function Setting({ icon, label, value, onClick, toggle }) { const tr = useT(); return <button className="setting" onClick={onClick}><span className="setting-icon">{icon}</span><span>{tr(label)}</span>{toggle ? <span className={`switch ${value ? 'on' : ''}`}><i /></span> : <><small>{label === 'Language' ? value : tr(value)}</small><ChevronRight size={16} /></>}</button>; }
function EmptyState({ text }) { const tr = useT(); return <div className="empty-state"><Search size={22} /><p>{tr(text)}</p></div>; }
