---
"@cuewise/browser-extension": minor
---

Add bulk quote operations and quote restoration functionality

## Bulk Operations
- Multi-select checkboxes on quote cards in Quote Management page
- Select all / deselect all for current filtered view
- Bulk delete, favorite/unfavorite, hide/unhide actions
- Confirmation dialog for destructive actions

## Quote Restoration
- "Restore Missing Quotes" - adds back deleted default quotes without affecting custom quotes
- "Reset All Quotes" - completely resets to factory defaults (with confirmation)
- Accessible via "More Options" dropdown in Quote Management page

## New Components
- ConfirmationDialog - reusable modal for destructive action confirmations
- BulkActionsToolbar - selection mode toggle and action buttons
- QuoteRestorationMenu - restore/reset dropdown menu
