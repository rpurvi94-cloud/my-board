import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const $ = s => document.querySelector(s);
let mode = 'login';

function say(text, ok = false) {
  $('#msg').textContent = text;
  $('#msg').className = ok ? 'ok' : '';
}

function setMode(m) {
  mode = m;
  const signup = m === 'signup';
  $('#heading').textContent = signup ? 'Create account' : 'Welcome back';
  $('#hint').textContent = signup ? 'Create an account with your email and password.' : 'Sign in to access your boards.';
  $('#submit').textContent = signup ? 'Create account' : 'Sign In';
  $('#switchText').textContent = signup ? 'Already have an account?' : 'don’t have an account?';
  $('#switchBtn').textContent = signup ? 'Sign In' : 'Sign Up';
  $('#confirmWrap').hidden = !signup;
  $('#forgot').hidden = signup;
  $('#googleRow').hidden = signup;
  $('#pass2').required = signup;
  $('#pass').autocomplete = signup ? 'new-password' : 'current-password';
  say('');
}

function authErrorMessage(err) {
  switch (err.code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account. Choose Log in instead.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password (at least 6 characters).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is disabled. Enable it in Firebase Console under Authentication → Sign-in method.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow popups and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.';
    case 'auth/network-request-failed':
      return 'Could not reach Firebase. Check your internet connection and try again.';
    default:
      return 'Firebase sign-in failed. Please try again.';
  }
}

$('#switchBtn').onclick = () => setMode(mode === 'login' ? 'signup' : 'login');

$('#forgot').onclick = async () => {
  const email = $('#user').value.trim().toLowerCase();
  if (!email) {
    say('Enter your email address first.');
    $('#user').focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    say('If an account exists for this address, a password reset email has been sent.', true);
  } catch (err) {
    console.error('Password reset email failed:', err);
    if (err.code === 'auth/invalid-email') {
      say('Enter a valid email address.');
    } else if (err.code === 'auth/network-request-failed') {
      say('Could not reach Firebase. Check your internet connection and try again.');
    } else {
      say('Could not send the reset email. Check your address and Firebase email settings.');
    }
  }
};

$('#googleSignIn').onclick = async () => {
  const button = $('#googleSignIn');
  button.disabled = true;
  say('');
  try {
    const credential = await signInWithPopup(auth, new GoogleAuthProvider());
    localStorage.setItem('currentUser', credential.user.uid);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Google sign-in failed:', err);
    if (err.code === 'auth/operation-not-allowed') {
      say('Google sign-in is disabled. Enable Google under Firebase Authentication → Sign-in method.');
    } else {
      say(authErrorMessage(err));
    }
  } finally {
    button.disabled = false;
  }
};

$('#form').onsubmit = async e => {
  e.preventDefault();
  const email = $('#user').value.trim().toLowerCase();
  const password = $('#pass').value;
  const submit = $('#submit');
  submit.disabled = true;
  say('');

  try {
    let credential;
    if (mode === 'signup') {
      if (password !== $('#pass2').value) {
        say('Passwords do not match.');
        return;
      }
      credential = await createUserWithEmailAndPassword(auth, email, password);
    } else {
      credential = await signInWithEmailAndPassword(auth, email, password);
    }

    localStorage.setItem('currentUser', credential.user.uid);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Firebase authentication failed:', err);
    say(authErrorMessage(err));
  } finally {
    submit.disabled = false;
  }
};

onAuthStateChanged(auth, user => {
  if (!user) return;
  try {
    localStorage.setItem('currentUser', user.uid);
    window.location.href = 'index.html';
  } catch (err) {
    console.error('Could not save the signed-in user:', err);
    say('Signed in, but browser storage is unavailable. Enable storage and reload.');
  }
}, err => {
  console.error('Could not check Firebase sign-in state:', err);
  say('Could not check your sign-in. Reload the page and try again.');
});
