# ReadSync - Quick Reference Guide

## 🚀 Quick Start

### For Users

1. Get your API key from ReadSync
2. Open any page (dashboard.html, mylist.html, etc.)
3. Enter API key when prompted
4. Start tracking your reading!

### For Admins

1. Open admin.html
2. Enter API key
3. Monitor bot status
4. Use "Force Global Update All" to update all novels
5. Watch real-time progress!

---

## 📱 Page Guide

| Page | URL | Purpose | When to Use |
|------|-----|---------|-------------|
| **Dashboard** | `/dashboard.html` | Home page | Check stats, quick nav |
| **Enhanced Dashboard** | `/dashboard-enhanced.html` | Modern home | Better analytics |
| **MyList** | `/mylist.html` | Library view | Browse all novels |
| **Novel Details** | `/novel.html?id=X` | Single novel | Deep dive into one |
| **Admin** | `/admin.html` | Bot control | Manage updates |
| **Manage** | `/manage.html` | Novel mgmt | Bulk operations |

---

## 🔑 Common Tasks

### View All Novels

```
Go to: mylist.html
Features: Search, sort, filter by status
Auto-refreshes: Every 3 minutes
```

### Check for New Chapters

```
Option 1: Wait 3 min for auto-refresh on mylist.html
Option 2: Go to admin.html → Click "Refresh Status"
Option 3: Force update specific novel in admin panel
Option 4: Click "Force Global Update All" ✨
```

### Change Novel Status

```
Option 1: mylist.html → Click status dropdown
Option 2: manage.html → Select novel → Change status
Option 3: novel.html → Status selector
```

### Remove a Novel

```
Go to: manage.html
Find novel
Click: "Soft Remove" (keeps history) or "HARD Delete" (permanent)
```

---

## 🤖 Bot Operations

### Check Bot Status

```
admin.html → View status cards
Shows: Running, Last Run, Novels Updated, Next Run
```

### Trigger Manual Update

```
admin.html → Click "⚡ Trigger Manual Update"
Bot processes 10 novels immediately
```

### Force Update All Novels

```
admin.html → Click "📚 Refresh Stale Novels"
Marks all novels as stale
Bot processes them in batches
✨ Shows real-time progress
```

### Update Single Novel

```
admin.html → Find novel in "Novels Needing Updates"
Click "🔄 Update" button
Novel updates and disappears from list
```

---

## 🔍 Search & Filter

### MyList Filters

- **Search**: Type in search box (filters by title)
- **Sort**: Click column headers (↑↓ arrows)
- **Status**: Use status dropdown selector

### Manage Filters

- **Status Filter**: Dropdown for reading/completed/etc.
- **Search**: Live filter by title

---

## 📊 Understanding the Data

### Progress Indicators

- **Percentage**: % of chapter read
- **Chapter Number**: Current chapter
- **Time Ago**: Last read time
- **Device**: Which device was used

### Novel Statuses

- 📘 **Reading**: Currently reading
- ✅ **Completed**: Finished
- ⏸️ **On-hold**: Paused
- ❌ **Dropped**: Abandoned
- 🗑️ **Removed**: Hidden

### Chapter Update States

- **Site Latest**: Chapter number on NovelBin
- **Last Updated**: When bot last checked
- **Stale**: Not checked in 24+ hours

---

## ⚡ Keyboard Shortcuts

None currently, but could be added!

---

## 🐛 Troubleshooting

### "Failed to load novels"

1. Check internet connection
2. Verify API key is correct
3. Refresh the page
4. Check console for errors

### "Bot not running"

1. Check admin panel status
2. Look for errors in status
3. Try manual trigger
4. Check server logs

### "Novel not updating"

1. Check if novel URL is valid
2. Use "Update" button in admin panel
3. Check bot errors
4. Verify site is accessible

### "Progress not syncing"

1. Verify userscript is installed
2. Check API key in userscript
3. Look for console errors
4. Check network tab

---

## 💡 Pro Tips

### For Better Performance

1. ✨ Let mylist.html stay open for auto-refresh
2. Use admin panel to pre-update novels
3. Check "Stale novels" list regularly
4. Mark completed novels to reduce checks

### For Organization

1. Use favorites for active reads
2. Set status appropriately
3. Add notes to novels
4. Use bookmarks for important spots

### For Admins

1. ✨ Watch real-time progress when updating
2. Update during low-traffic times
3. Check bot status regularly
4. Monitor for errors

---

## 📈 Best Practices

### Reading Workflow

1. Start novel on any device
2. Progress auto-saves
3. Switch devices seamlessly
4. Check mylist.html for updates
5. Continue reading from latest

### Admin Workflow

1. Check admin panel daily
2. Review stale novels list
3. Force update if needed
4. Monitor bot health
5. Address errors quickly

### Organization

1. Set statuses immediately
2. Mark favorites for quick access
3. Add notes for reference
4. Clean up removed novels
5. Export data periodically (if available)

---

## 🔗 API Endpoints Quick Ref

### Most Used

```
GET  /api/v1/novels              - List novels
POST /api/v1/progress            - Save progress
GET  /api/v1/admin/bot/status    - Bot status
GET  /api/v1/admin/bot/progress  - Live progress ✨
POST /admin/force-refresh-all    - Update all ✨
```

### All Endpoints

See PROJECT_OVERVIEW.md for complete list (44 total)

---

## 🎨 Customization

### Changing Refresh Interval

Edit mylist.html line ~1098:

```javascript
}, 3 * 60 * 1000); // Change 3 to desired minutes
```

### Changing Bot Check Interval

Edit chapter-update-bot-enhanced.js line 5:

```javascript
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // Change 30 to desired minutes
```

---

## 📝 Notes

### Auto-refresh ✨

- MyList: Every 3 minutes
- Admin Progress: Every 3 seconds (when updating)

### Bot Schedule

- Runs every 30 minutes automatically
- Checks 10 novels per batch
- 2 second delay between requests
- Prioritizes novels with active readers

### Data Retention

- Progress: Indefinite
- Sessions: Indefinite
- Bookmarks: Indefinite
- Removed novels: Soft delete keeps data

---

## 🆘 Support

### Check Documentation

1. COMPLETE_FIX_GUIDE.md - Fix instructions
2. PROJECT_OVERVIEW.md - Complete analysis
3. PROJECT_MAP.md - Visual structure
4. VISUAL_FLOW.md - Data flows
5. EXECUTIVE_SUMMARY.md - Overview

### Debug Mode

Open browser console (F12) to see:

- API requests
- Errors
- Auto-refresh logs
- Progress updates

---

## ✅ Checklist for New Users

- [ ] Get API key
- [ ] Test on dashboard.html
- [ ] Install userscript (if needed)
- [ ] Add first novel
- [ ] Check mylist.html
- [ ] Try changing status
- [ ] View novel details
- [ ] Check admin panel
- [ ] Test force update
- [ ] Watch progress tracking ✨

---

## 🎯 Most Common Actions

1. **View library**: mylist.html
2. **Check updates**: admin.html → Refresh
3. **Change status**: mylist.html → Dropdown
4. **Force update all**: admin.html → Force Update All ✨
5. **View details**: Click novel title anywhere

---

**Last Updated**: November 21, 2025
**Version**: 2.0 (with fixes ✨)
