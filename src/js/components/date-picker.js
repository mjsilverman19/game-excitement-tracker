/**
 * Custom date picker component for NBA date selection
 * Generates a calendar grid with navigation
 */

/**
 * Populates the custom date picker calendar
 * - Initializes picker to current selected date's month
 * - Handles month navigation (prev/next)
 * - Generates calendar grid with proper day alignment
 * - Highlights selected date
 * - Disables future dates
 * - Handles date selection and updates UI
 */
export function populateCustomDatePicker() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentDate = window.selectedDate ? new Date(window.selectedDate) : new Date(today.getTime() - 24*60*60*1000);

    // Initialize picker to current selected date's month
    if (!window.pickerMonth && !window.pickerYear) {
        window.pickerMonth = currentDate.getMonth();
        window.pickerYear = currentDate.getFullYear();
    }

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Update month/year display
    document.getElementById('pickerMonthYear').textContent = `${monthNames[window.pickerMonth]} ${window.pickerYear}`;

    // Setup month navigation
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');

    prevMonthBtn.onclick = (e) => {
        e.stopPropagation();
        window.pickerMonth--;
        if (window.pickerMonth < 0) {
            window.pickerMonth = 11;
            window.pickerYear--;
        }
        populateCustomDatePicker();
    };

    nextMonthBtn.onclick = (e) => {
        e.stopPropagation();
        window.pickerMonth++;
        if (window.pickerMonth > 11) {
            window.pickerMonth = 0;
            window.pickerYear++;
        }
        populateCustomDatePicker();
    };

    // Build calendar grid
    const firstDay = new Date(window.pickerYear, window.pickerMonth, 1);
    const lastDay = new Date(window.pickerYear, window.pickerMonth + 1, 0);
    const prevMonthLastDay = new Date(window.pickerYear, window.pickerMonth, 0);

    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = lastDay.getDate();
    const daysInPrevMonth = prevMonthLastDay.getDate();

    const dateGrid = document.getElementById('dateGrid');

    // Remove all existing date cells (keep headers)
    const headers = Array.from(dateGrid.querySelectorAll('.date-grid-header'));
    dateGrid.innerHTML = '';
    headers.forEach(header => dateGrid.appendChild(header));

    // Add previous month's trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const cell = document.createElement('div');
        cell.className = 'date-item other-month';
        cell.textContent = day;
        dateGrid.appendChild(cell);
    }

    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'date-item';
        cell.textContent = day;

        const cellDate = new Date(window.pickerYear, window.pickerMonth, day);

        // Disable future dates
        if (cellDate > today) {
            cell.classList.add('disabled');
        } else {
            // Check if this is the selected date
            const cellDateStr = cellDate.toISOString().split('T')[0];
            const selectedDateStr = window.selectedDate || new Date(today.getTime() - 24*60*60*1000).toISOString().split('T')[0];

            if (cellDateStr === selectedDateStr) {
                cell.classList.add('selected');
            }

            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                window.periodAverages = null;
                window.selectedDate = cellDateStr;
                console.log(`📅 NBA window.selectedDate changed via date picker: ${window.selectedDate}`);
                window.isInitialLoad = false; // User manually selected date
                document.getElementById('customDatePicker').classList.remove('visible');
                window.updateUI();
                window.loadGames();
            });
        }

        dateGrid.appendChild(cell);
    }

    // Add next month's leading days to complete the grid
    // Count only date-item cells (not headers)
    const dateCells = dateGrid.querySelectorAll('.date-item').length;
    const remainingCells = (Math.ceil(dateCells / 7) * 7) - dateCells;

    for (let day = 1; day <= remainingCells; day++) {
        const cell = document.createElement('div');
        cell.className = 'date-item other-month';
        cell.textContent = day;
        dateGrid.appendChild(cell);
    }
}
