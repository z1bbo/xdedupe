// TODO next version: make TTL days configurable
const DEFAULT_TTL_DAYS = 7;

let db;
var indexedDB = window.indexedDB;
const dbName = "SeenTweets";
const storeName = "seen_tweets";
const dbVersion = 1;

function initializeDB() {
  return new Promise((resolve, _) => {
    console.log('calling indexedDB.open with', dbName, dbVersion);
    const openDBRequest = indexedDB.open(dbName, dbVersion);

    openDBRequest.onsuccess = function(event) {
      db = event.target.result;
      console.log('indexedDB.open success, db is', db);
      resolve(db);
    };

    openDBRequest.onupgradeneeded = function(event) {
      db = event.target.result;
      db.createObjectStore(storeName, { keyPath: "id" });
      console.log('indexedDB.open upgradeneeded, db is', db);
    };
  });
}

const seen = new Map();
const undoneTweets = new Set();
let oldTweets = [];

function loadSeen() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const now = Date.now();

    let taken = 0;
    let deleted = 0;
    const allLoadedIds = [];
    objectStore.openCursor().onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
        if (cursor.value.expire_at > now) {
          seen.set(cursor.value.id, cursor.value.expire_at);
          allLoadedIds.push(cursor.value.id);
          taken++;
        } else {
          cursor.delete();
          deleted++;
        }
        cursor.continue();
      } else {
        console.log(`XDedupe: Loaded ${taken} seen tweets from IndexedDB, deleted ${deleted} expired tweets`);
        console.log(`XDedupe: Current seen tweets map size: ${seen.size}`);
        if (allLoadedIds.length > 0) {
          console.log(`XDedupe: Sample loaded tweet IDs:`, allLoadedIds.slice(-5));
        }
        resolve(seen);
      }
    };
  });
}

function addAndHideSeen() {
  const tweets = getTweets();
  console.log(`XDedupe: Processing ${tweets.length} visible tweets, seen map has ${seen.size} entries`);
  hideSeenTweetsBelow(tweets);
  markScrolledByTweetsSeen(tweets);
  return tweets.length > 0;
}

function getTweets() {
  const tweets = document.querySelectorAll('article[role="article"][data-testid="tweet"]');
  return Array.from(tweets).filter(tweet => tweet.getBoundingClientRect().bottom >= 140);
}

function markScrolledByTweetsSeen(newTweets) {
  let markedCount = 0;
  for (const tweet of oldTweets) {
    const rect = tweet.getBoundingClientRect();
    if (rect.height > 0 && rect.width > 0 && rect.bottom < 220) {
      addSeen(tweet);
      markedCount++;
    }
  }
  if (markedCount > 0) {
    console.log(`XDedupe: Marked ${markedCount} scrolled-by tweets as seen`);
  }
  oldTweets = newTweets;
}

function addSeen(tweet, ttlDays = DEFAULT_TTL_DAYS) {
  const id = getId(tweet);
  if (id === null) {
    console.log('XDedupe: Could not get ID for tweet, skipping save');
    return;
  }
  const expireAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  seen.set(id, expireAt);
  console.log(`XDedupe: Saving individual tweet ID: ${id}, seen map size now: ${seen.size}`);
  new Promise(() => {
    const transaction = db.transaction([storeName], "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const putRequest = objectStore.put({ id: id, expire_at: expireAt });
    putRequest.onsuccess = () => {
      console.log(`XDedupe: Successfully saved tweet ID ${id} to IndexedDB`);
    };
    putRequest.onerror = (error) => {
      console.error(`XDedupe: Error saving tweet ID ${id} to IndexedDB:`, error);
    };
  });
}

function getId(tweet) {
  const username = getUsername(tweet);
  // /analytics for the /home page
  // /history for e.g. the /status page
  const statusLink = tweet.querySelector(`a[href^="/${username}/status/"][href$="/analytics"], a[href^="/${username}/status/"][href$="/history"]`);
  if (statusLink === null) {
    return null;
  }
  const parts = statusLink.href.split('/');
  return parts[parts.length - 2];
}

function getUsername(tweet) {
  const usernameHref = tweet.querySelector('[data-testid^="UserAvatar-Container-"]').querySelector('a[href]').href
  return usernameHref.split('/').pop();
}

function hideSeenTweetsBelow(tweets) {
  // don't hide the top tweet on the /status/{id} page
  var i = window.location.href.match(/^https:\/\/x\.com\/\w+\/status\/\d+$/) ? 1 : 0;
  for (; i < tweets.length; i++) {
    const bottomThreshold = 140;
    const tweet = tweets[i];
    const tweetTop = tweet.getBoundingClientRect().top;
    const id = getId(tweet);
    if (tweetTop > bottomThreshold && hasSeen(id)) {
      replaceWithPlaceholder(tweet, id);
    }
  }
}

function replaceWithPlaceholder(tweet, tweetId) {
  const originalDataTestid = tweet.getAttribute('data-testid');
  tweet.removeAttribute('data-testid');
  const hidden = [];
  const outer = tweet.firstChild.firstChild;
  hide(outer.firstChild, hidden);
  const inner = outer.lastChild;
  const namePanelParent = inner.children[1];
  for (let i = 1; i < namePanelParent.children.length; i++) {
    hide(namePanelParent.children[i], hidden);
  }
  const namePanel = namePanelParent.firstElementChild.firstElementChild;
  hide(namePanel.lastChild, hidden);

  const viewButton = document.createElement('span');
  viewButton.innerHTML = 'View';
  viewButton.style.cssText = `
    font-family: "TwitterChirp";
    font-size: 0.9em;
    transition: background-color 0.1s ease;
    cursor: pointer;
    padding: 2px 0px;
  `;
  viewButton.addEventListener('mouseover', () => {
    viewButton.style.backgroundColor = 'lightgrey';
  });
  viewButton.addEventListener('mouseout', () => {
    viewButton.style.backgroundColor = 'transparent';
  });

  const faceDiv = inner.firstChild.firstChild;
  const originalInnerBottomPadding = window.getComputedStyle(inner.lastChild).paddingBottom;
  faceDiv.style.transform = 'scale(0.7)';
  faceDiv.style.transformOrigin = 'center';
  inner.lastChild.style.paddingBottom = '0px';

  tweet.addEventListener('click', function restoreTweet(event) {
    event.preventDefault();
    viewButton.remove();
    hidden.forEach(node => node.style.display = '');
    tweet.setAttribute('data-testid', originalDataTestid);
    faceDiv.style.transform = 'scale(1.0)';
    inner.lastChild.style.paddingBottom = originalInnerBottomPadding;
    undoneTweets.add(tweetId);
    tweet.removeEventListener('click', restoreTweet);
  });

  namePanel.appendChild(viewButton);
}

function hide(node, hidden) {
  node.style.display = 'none';
  hidden.push(node)
}

function hasSeen(id) {
  if (id === null) {
    return false;
  }
  return !!seen.get(id) && !undoneTweets.has(id);
}

let intervalId = null;

async function startExtension() {
  console.log('startExtension called');
  await initializeDB();
  await loadSeen();
  intervalId = setInterval(addAndHideSeen, 800);
  window.addEventListener('focus', loadSeen, { passive: true });
  window.addEventListener('focus', addAndHideSeen, { passive: true });
}

function stopExtension() {
  console.log('stopExtension called');
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  window.removeEventListener('focus', loadSeen, { passive: true });
  window.removeEventListener('focus', addAndHideSeen, { passive: true });
}

function toggleExtension(active) {
  console.log('toggleExtension called with', active);
  if (active === "false") {
    stopExtension();
  } else {
    startExtension();
  }
}

// browser for Firefox, chrome for Chrome
const backend = (typeof browser !== 'undefined') ? browser : chrome;

// Get initial storage value via message passing
backend.runtime.sendMessage({
  action: 'getStorage',
  key: 'xdedupeActive'
}).then((result) => {
  console.log('got initial result from runtime.sendMessage, toggling', result);
  toggleExtension(result.xdedupeActive);
}).catch((error) => {
  console.log('XDedupe: Could not get storage, defaulting to inactive');
  toggleExtension('false');
});

// Listen for storage changes from background script
backend.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('listener for runtime.onMessage triggered', request);
  if (request.action === 'storageChanged' && 'xdedupeActive' in request.changes) {
    toggleExtension(request.changes.xdedupeActive.newValue);
  }
});
