// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Global constants
const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
];

// DOM elements
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const extractBtn = document.getElementById('extract-btn');
const loader = document.getElementById('loader');
const resultContainer = document.getElementById('result-container');
const icalData = document.getElementById('ical-data');
const downloadBtn = document.getElementById('download-btn');
const copyBtn = document.getElementById('copy-btn');
const icalLink = document.getElementById('ical-link');
const preview = document.getElementById('preview');
const eventsList = document.getElementById('events-list');
const calendarMonth = document.getElementById('calendar-month');
const calendarYear = document.getElementById('calendar-year');
const timezoneSelect = document.getElementById('timezone-select');
const dayMarker = document.getElementById('day-marker');
const editEventsBtn = document.getElementById('edit-events-btn');

// Variables for storing PDF file and calendar events
let pdfFile = null;
let calendarEvents = [];

// Set default month and year
const currentDate = new Date();
calendarMonth.value = currentDate.getMonth();
calendarYear.value = currentDate.getFullYear();

// Try to detect user timezone
try {
    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (userTimeZone) {
        const timezoneOptions = Array.from(timezoneSelect.options).map(option => option.value);
        if (timezoneOptions.includes(userTimeZone)) {
            timezoneSelect.value = userTimeZone;
        }
    }
} catch (e) {
    console.error("Could not detect user timezone:", e);
}

// Create modal for event editing
const editEventsModal = document.createElement('div');
editEventsModal.className = 'modal';
document.body.appendChild(editEventsModal);

const modalContent = document.createElement('div');
modalContent.className = 'modal-content';
editEventsModal.appendChild(modalContent);

// Modal buttons
const closeButton = document.createElement('button');
closeButton.textContent = 'Close';
closeButton.style.marginTop = '20px';
closeButton.addEventListener('click', () => {
    editEventsModal.style.display = 'none';
});

const saveButton = document.createElement('button');
saveButton.textContent = 'Save Events';
saveButton.className = 'save-btn';
saveButton.style.marginTop = '20px';

modalContent.innerHTML = '<h2>Edit Events</h2><p>Add, edit, or remove events below:</p>';
modalContent.appendChild(saveButton);
modalContent.appendChild(closeButton);

// Event editor container
const eventEditor = document.createElement('div');
eventEditor.id = 'event-editor';
modalContent.insertBefore(eventEditor, saveButton);

// Upload handling
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '#e8ecf1';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.backgroundColor = '#f1f2f6';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '#f1f2f6';
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
        handleFileUpload(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
    }
});

function handleFileUpload(file) {
    pdfFile = file;
    fileName.textContent = `Selected file: ${file.name}`;
    extractBtn.disabled = false;
    preview.style.display = 'none';
    resultContainer.style.display = 'none';
}

// Extract events from PDF
extractBtn.addEventListener('click', async () => {
    if (!pdfFile) return;
    
    // Validate month and year inputs
    const month = parseInt(calendarMonth.value);
    const year = parseInt(calendarYear.value);
    
    if (isNaN(year) || year < 2020 || year > 2030) {
        alert('Please enter a valid year between 2020 and 2030.');
        return;
    }
    
    loader.style.display = 'block';
    extractBtn.disabled = true;
    
    try {
        const pdfData = await readFileAsArrayBuffer(pdfFile);
        const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
        
        calendarEvents = [];
        let allText = '';
        
        // Process each page of the PDF
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            allText += pageText + ' ';
        }
        
        // Extract events based on the calendar format
        const calFormat = dayMarker.value;
        if (calFormat === 'grid') {
            calendarEvents = processGridCalendar(allText, month, year);
        } else if (calFormat === 'text') {
            calendarEvents = processTextCalendar(allText, month, year);
        } else {
            calendarEvents = processStandardCalendar(allText, month, year);
        }
        
        // Display preview of extracted events
        displayEventPreview();
        
        // Generate iCal data
        updateICalData();
        
        resultContainer.style.display = 'block';
        
        // Show edit button only after successful extraction
        editEventsBtn.style.display = 'inline-block';
    } catch (error) {
        console.error('Error processing PDF:', error);
        alert('Error processing PDF. Please try another file.');
    } finally {
        loader.style.display = 'none';
        extractBtn.disabled = false;
    }
});

// Show event editor when edit button is clicked
editEventsBtn.addEventListener('click', () => {
    showEventEditor();
});

// Read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Process standard calendar format
function processStandardCalendar(text, month, year) {
    console.log(`Processing calendar for ${monthNames[month]} ${year}`);
    const events = [];
    
    // Find day numbers (1-31)
    const dayRegex = /\b([1-9]|[12][0-9]|3[01])\b/g;
    const dayMatches = [];
    let match;
    
    while ((match = dayRegex.exec(text)) !== null) {
        const day = parseInt(match[1]);
        if (day >= 1 && day <= 31) {
            // Skip if part of a time or longer number
            const beforeContext = text.substring(Math.max(0, match.index - 10), match.index);
            const afterContext = text.substring(match.index + match[0].length, 
                                        Math.min(text.length, match.index + match[0].length + 10));
            
            if (!beforeContext.includes(':') && 
                !/\d/.test(text.charAt(match.index - 1)) && 
                !/\d/.test(text.charAt(match.index + match[0].length))) {
                
                dayMatches.push({
                    day: day,
                    index: match.index,
                    context: text.substring(match.index, match.index + 300)
                });
            }
        }
    }
    
    console.log(`Found ${dayMatches.length} potential day markers`);
    
    // Process each day
    for (const dayMatch of dayMatches) {
        const day = dayMatch.day;
        const context = dayMatch.context;
        const dayEvents = extractEventsForDay(context, day, month, year);
        events.push(...dayEvents);
    }
    
    console.log(`Extracted ${events.length} total events`);
    return events;
}

// Process grid-style calendar
function processGridCalendar(text, month, year) {
    return processStandardCalendar(text, month, year);
}

// Process text-style calendar
function processTextCalendar(text, month, year) {
    return processStandardCalendar(text, month, year);
}

// Extract events for a specific day
function extractEventsForDay(context, day, month, year) {
    const events = [];
    
    // Find times (e.g., 9:30, 10:00, etc.)
    const timeRegex = /\b(([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9])(?:\s*([aApP][mM])?)?\b/g;
    let timeMatch;
    
    console.log(`Processing events for day ${day} of ${monthNames[month]} ${year}`);
    
    while ((timeMatch = timeRegex.exec(context)) !== null) {
        const timeStr = timeMatch[1];
        const ampmStr = timeMatch[3] ? timeMatch[3].toLowerCase() : null;
        
        // Parse hours and minutes
        const [hoursStr, minutesStr] = timeStr.split(':');
        let hours = parseInt(hoursStr);
        const minutes = parseInt(minutesStr);
        
        // Apply AM/PM rules
        if (ampmStr) {
            if (ampmStr === 'pm' && hours < 12) hours += 12;
            else if (ampmStr === 'am' && hours === 12) hours = 0;
        } else if (hours < 7) {
            hours += 12; // Assume 1-6 is PM
        }
        
        // Get description
        const afterTimeText = context.substring(
            timeMatch.index + timeMatch[0].length,
            Math.min(context.length, timeMatch.index + timeMatch[0].length + 100)
        );
        
        // Extract until clear break (multiple spaces, newline, etc.)
        let description = afterTimeText.trim().split(/\s{2,}|\n|\r/)[0];
        if (description.length < 3) {
            description = afterTimeText.trim().substring(0, 50);
        }
        
        // Extract location code if present (L), (DR), etc.
        const locationRegex = /\(((?:L|M|RH|DR|Ch|CC|GR|Lb|O)[a-z]*)\)/;
        const locationMatch = locationRegex.exec(description);
        let location = '';
        
        if (locationMatch) {
            location = locationMatch[1];
            description = description.replace(locationMatch[0], '').trim();
        }
        
        if (description && description.length > 0) {
            // Create the event date - ensure we're creating a new Date object
            let start = new Date(year, month, day, hours, minutes);
            let end = new Date(year, month, day, hours + 1, minutes);
            
            // Debug log
            console.log(`Adding event: "${description}" on ${start.toISOString()}`);
            
            events.push({
                summary: description,
                start: start,
                end: end,
                location: location,
                isAllDay: false
            });
        }
    }
    
    // Check for all-day events if no timed events found
    if (events.length === 0) {
        const specialDays = [
            "Father's Day", "Mother's Day", "Valentine's Day", 
            "Christmas", "Easter", "New Year", "Halloween",
            "Thanksgiving", "Memorial Day", "Labor Day",
            "Juneteenth", "Flag Day", "President's Day",
            "Independence Day", "Veteran's Day",
            "Martin Luther King", "Columbus Day",
            "POPCORN DAY", "Groundhog Day", "Super Bowl"
        ];
        
        for (const specialDay of specialDays) {
            if (context.includes(specialDay)) {
                // Create all-day event with proper date
                const start = new Date(year, month, day, 0, 0, 0);
                const end = new Date(year, month, day + 1, 0, 0, 0);
                
                console.log(`Adding all-day event: "${specialDay}" on ${start.toISOString()}`);
                
                events.push({
                    summary: specialDay,
                    start: start,
                    end: end,
                    location: '',
                    isAllDay: true
                });
            }
        }
    }
    
    console.log(`Found ${events.length} events for day ${day}`);
    return events;
}

// Display event preview
function displayEventPreview() {
    eventsList.innerHTML = '';
    
    if (calendarEvents.length === 0) {
        eventsList.innerHTML = '<p>No events detected. Try another PDF file or adjust the month/year settings.</p>';
    } else {
        // Sort events by date
        calendarEvents.sort((a, b) => a.start - b.start);
        
        // Group events by day
        const eventsByDay = {};
        calendarEvents.forEach(event => {
            const day = event.start.getDate();
            if (!eventsByDay[day]) {
                eventsByDay[day] = [];
            }
            eventsByDay[day].push(event);
        });
        
        // Create a header for each day
        Object.keys(eventsByDay).sort((a, b) => a - b).forEach(day => {
            const dayEvents = eventsByDay[day];
            
            // Create day header
            const dayHeader = document.createElement('h4');
            const date = dayEvents[0].start;
            dayHeader.textContent = date.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
            });
            eventsList.appendChild(dayHeader);
            
            // Add events for this day
            dayEvents.forEach(event => {
                const eventElement = document.createElement('div');
                eventElement.className = 'event';
                
                const titleElement = document.createElement('div');
                titleElement.className = 'event-title';
                titleElement.textContent = event.summary;
                
                const timeElement = document.createElement('div');
                timeElement.className = 'event-time';
                
                if (event.isAllDay) {
                    timeElement.textContent = 'All Day';
                } else {
                    timeElement.textContent = `${event.start.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit'
                    })} - ${event.end.toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit'
                    })}`;
                }
                
                eventElement.appendChild(titleElement);
                eventElement.appendChild(timeElement);
                eventsList.appendChild(eventElement);
            });
        });
    }
    
    preview.style.display = 'block';
}

// Format date for input fields
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format time for input fields
function formatTimeForInput(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Show event editor
function showEventEditor() {
    // Clear previous content
    eventEditor.innerHTML = '';
    
    // Add buttons at the top
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'sticky';
    buttonContainer.style.top = '0';
    buttonContainer.style.backgroundColor = '#fff';
    buttonContainer.style.padding = '10px 0';
    buttonContainer.style.borderBottom = '1px solid #ddd';
    buttonContainer.style.marginBottom = '20px';
    buttonContainer.style.zIndex = '10';
    
    // Make save button more prominent
    saveButton.style.display = 'inline-block';
    saveButton.style.marginRight = '10px';
    
    // Add buttons to container
    buttonContainer.appendChild(saveButton);
    buttonContainer.appendChild(closeButton);
    
    // Add button container to the editor before any content
    modalContent.insertBefore(buttonContainer, modalContent.firstChild);
    
    if (calendarEvents.length === 0) {
        eventEditor.innerHTML = '<p>No events to edit. Extract events first.</p>';
    } else {
        // Sort all events by date and time
        calendarEvents.sort((a, b) => a.start - b.start);
        
        // Create the table
        const table = document.createElement('table');
        table.className = 'events-table';
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Date</th>
                <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Time</th>
                <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd; width: 40%;">Event</th>
                <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">All Day</th>
                <th style="text-align: left; padding: 8px; border-bottom: 2px solid #ddd;">Actions</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        
        // Add events to table
        calendarEvents.forEach((event, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index;
            tr.style.borderBottom = '1px solid #eee';
            
            // Date cell
            const dateCell = document.createElement('td');
            dateCell.style.padding = '8px';
            const dateInput = document.createElement('input');
            dateInput.type = 'date';
            dateInput.className = 'event-date';
            dateInput.value = formatDateForInput(event.start);
            dateInput.style.border = '1px solid #ddd';
            dateInput.style.padding = '4px';
            dateInput.style.borderRadius = '3px';
            dateCell.appendChild(dateInput);
            
            // Time cell - contains start and end times if not all-day
            const timeCell = document.createElement('td');
            timeCell.style.padding = '8px';
            
            const timeContainer = document.createElement('div');
            timeContainer.className = 'time-inputs';
            timeContainer.style.display = event.isAllDay ? 'none' : 'block';
            
            const startTimeInput = document.createElement('input');
            startTimeInput.type = 'time';
            startTimeInput.className = 'start-time';
            startTimeInput.value = formatTimeForInput(event.start);
            startTimeInput.style.border = '1px solid #ddd';
            startTimeInput.style.padding = '4px';
            startTimeInput.style.borderRadius = '3px';
            startTimeInput.style.marginBottom = '5px';
            startTimeInput.style.width = '100%';
            
            const endTimeInput = document.createElement('input');
            endTimeInput.type = 'time';
            endTimeInput.className = 'end-time';
            endTimeInput.value = formatTimeForInput(event.end);
            endTimeInput.style.border = '1px solid #ddd';
            endTimeInput.style.padding = '4px';
            endTimeInput.style.borderRadius = '3px';
            endTimeInput.style.width = '100%';
            
            const startLabel = document.createElement('small');
            startLabel.textContent = 'Start:';
            startLabel.style.display = 'block';
            startLabel.style.color = '#666';
            
            const endLabel = document.createElement('small');
            endLabel.textContent = 'End:';
            endLabel.style.display = 'block';
            endLabel.style.color = '#666';
            endLabel.style.marginTop = '5px';
            
            timeContainer.appendChild(startLabel);
            timeContainer.appendChild(startTimeInput);
            timeContainer.appendChild(endLabel);
            timeContainer.appendChild(endTimeInput);
            
            timeCell.appendChild(timeContainer);
            
            // Event title cell
            const titleCell = document.createElement('td');
            titleCell.style.padding = '8px';
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.className = 'event-title';
            titleInput.value = event.summary;
            titleInput.style.width = '100%';
            titleInput.style.border = '1px solid #ddd';
            titleInput.style.padding = '4px';
            titleInput.style.borderRadius = '3px';
            titleCell.appendChild(titleInput);
            
            // All day checkbox cell
            const allDayCell = document.createElement('td');
            allDayCell.style.padding = '8px';
            const allDayCheckbox = document.createElement('input');
            allDayCheckbox.type = 'checkbox';
            allDayCheckbox.className = 'all-day-checkbox';
            allDayCheckbox.checked = event.isAllDay;
            allDayCell.appendChild(allDayCheckbox);
            
            // Actions cell
            const actionsCell = document.createElement('td');
            actionsCell.style.padding = '8px';
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'Delete';
            deleteBtn.className = 'delete-btn';
            deleteBtn.style.backgroundColor = '#e74c3c';
            deleteBtn.style.color = 'white';
            deleteBtn.style.border = 'none';
            deleteBtn.style.padding = '4px 8px';
            deleteBtn.style.borderRadius = '3px';
            deleteBtn.style.cursor = 'pointer';
            actionsCell.appendChild(deleteBtn);
            
            // Append all cells to the row
            tr.appendChild(dateCell);
            tr.appendChild(timeCell);
            tr.appendChild(titleCell);
            tr.appendChild(allDayCell);
            tr.appendChild(actionsCell);
            
            // Add row to table body
            tbody.appendChild(tr);
            
            // Event listeners
            // All-day checkbox
            allDayCheckbox.addEventListener('change', function() {
                timeContainer.style.display = this.checked ? 'none' : 'block';
            });
            
            // Delete button
            deleteBtn.addEventListener('click', function() {
                calendarEvents.splice(index, 1);
                tr.remove();
                
                // Update other rows' indices after deletion
                const rows = tbody.querySelectorAll('tr');
                rows.forEach((row, i) => {
                    row.dataset.index = i;
                    const deleteButton = row.querySelector('.delete-btn');
                    deleteButton.onclick = function() {
                        calendarEvents.splice(i, 1);
                        row.remove();
                    };
                });
            });
            
            // Auto-sort when date or time changes
            dateInput.addEventListener('change', () => scheduleReSort(tbody));
            startTimeInput.addEventListener('change', () => scheduleReSort(tbody));
            allDayCheckbox.addEventListener('change', () => scheduleReSort(tbody));
        });
        
        table.appendChild(tbody);
        eventEditor.appendChild(table);
        
        // Add "Add Event" button
        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add New Event';
        addBtn.style.marginTop = '20px';
        addBtn.style.backgroundColor = '#3498db';
        
        addBtn.addEventListener('click', function() {
            const month = parseInt(calendarMonth.value);
            const year = parseInt(calendarYear.value);
            const today = new Date();
            
            const newEventDate = new Date(year, month, today.getDate(), 9, 0, 0);
            const newEndDate = new Date(year, month, today.getDate(), 10, 0, 0);
            
            const newEvent = {
                summary: 'New Event',
                start: newEventDate,
                end: newEndDate,
                location: '',
                isAllDay: false
            };
            
            calendarEvents.push(newEvent);
            showEventEditor(); // Refresh the editor
        });
        
        eventEditor.appendChild(addBtn);
    }
    
    // Handle save button
    saveButton.onclick = function() {
        // Update events from editor inputs
        const rows = eventEditor.querySelectorAll('tr[data-index]');
        
        rows.forEach((row) => {
            const index = parseInt(row.dataset.index);
            const dateInput = row.querySelector('.event-date');
            const titleInput = row.querySelector('.event-title');
            const allDayCheckbox = row.querySelector('.all-day-checkbox');
            const startTimeInput = row.querySelector('.start-time');
            const endTimeInput = row.querySelector('.end-time');
            
            if (index < calendarEvents.length) {
                const event = calendarEvents[index];
                
                // Update event data
                event.summary = titleInput.value;
                event.isAllDay = allDayCheckbox.checked;
                
                // Parse the date
                const [year, month, day] = dateInput.value.split('-').map(Number);
                
                if (!event.isAllDay && startTimeInput && endTimeInput) {
                    // Update start time
                    const [startHours, startMinutes] = startTimeInput.value.split(':').map(Number);
                    event.start = new Date(year, month - 1, day, startHours, startMinutes, 0);
                    
                    // Update end time
                    const [endHours, endMinutes] = endTimeInput.value.split(':').map(Number);
                    event.end = new Date(year, month - 1, day, endHours, endMinutes, 0);
                    
                    // Handle end time earlier than start time (assume next day)
                    if (event.end < event.start) {
                        event.end.setDate(event.end.getDate() + 1);
                    }
                } else if (event.isAllDay) {
                    // Set proper all-day event times
                    event.start = new Date(year, month - 1, day, 0, 0, 0);
                    event.end = new Date(year, month - 1, day + 1, 0, 0, 0);
                }
            }
        });
        
        // Update the preview
        displayEventPreview();
        
        // Update iCal data
        updateICalData();
        
        // Close modal
        editEventsModal.style.display = 'none';
    };
    
    // Show modal
    editEventsModal.style.display = 'block';
}

// Helper for debounced re-sorting
let resortTimeout = null;
function scheduleReSort(tbody) {
    if (resortTimeout) {
        clearTimeout(resortTimeout);
    }
    
    resortTimeout = setTimeout(() => {
        // First update the calendarEvents array with current values
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row) => {
            const index = parseInt(row.dataset.index);
            if (index < calendarEvents.length) {
                const dateInput = row.querySelector('.event-date');
                const allDayCheckbox = row.querySelector('.all-day-checkbox');
                const startTimeInput = row.querySelector('.start-time');
                
                // Parse the date
                const [year, month, day] = dateInput.value.split('-').map(Number);
                
                if (!allDayCheckbox.checked && startTimeInput) {
                    // Update start time
                    const [startHours, startMinutes] = startTimeInput.value.split(':').map(Number);
                    calendarEvents[index].start = new Date(year, month - 1, day, startHours, startMinutes, 0);
                } else {
                    // All-day event
                    calendarEvents[index].start = new Date(year, month - 1, day, 0, 0, 0);
                }
                
                calendarEvents[index].isAllDay = allDayCheckbox.checked;
            }
        });
        
        // Resort and refresh
        showEventEditor();
    }, 500); // Debounce for 500ms
}

// Function to update iCal data after edits
function updateICalData() {
    const timezone = timezoneSelect.value;
    const icalString = generateICalData(calendarEvents, timezone);
    icalData.value = icalString;
    
    // Create blob link for download
    const blob = new Blob([icalString], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    icalLink.textContent = url;
    
    // Set up download button
    downloadBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pdfFile.name.replace('.pdf', '')}.ics`;
        a.click();
    };
    
    // Set up copy button
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(url)
            .then(() => alert('iCal link copied to clipboard!'))
            .catch(err => console.error('Failed to copy: ', err));
    };
}

// Generate iCal data
function generateICalData(events, timezone) {
    const calendarComponent = new ICAL.Component(['vcalendar', [], []]);
    
    // Set required properties
    calendarComponent.updatePropertyWithValue('prodid', '-//PDF Calendar Converter//EN');
    calendarComponent.updatePropertyWithValue('version', '2.0');
    calendarComponent.updatePropertyWithValue('calscale', 'GREGORIAN');
    calendarComponent.updatePropertyWithValue('method', 'PUBLISH');
    
    console.log('Generating iCal with', events.length, 'events');
    
    events.forEach((event, index) => {
        const vevent = new ICAL.Component('vevent');
        
        // Add summary (event title)
        const summary = new ICAL.Property('summary', vevent);
        summary.setValue(event.summary);
        vevent.addProperty(summary);
        
        // Debug: Log each event's date information
        console.log(`Event ${index}: ${event.summary}`);
        console.log(`  Original start: ${event.start.toISOString()}`);
        console.log(`  Original end: ${event.end.toISOString()}`);
        
        // Handle start time differently for all-day events
        if (event.isAllDay) {
            // Create a date-only value for all-day events
            const dtstart = new ICAL.Property('dtstart', vevent);
            const startTime = new ICAL.Time({
                year: event.start.getFullYear(),
                month: event.start.getMonth() + 1, // ICAL.js uses 1-based months
                day: event.start.getDate(),
                isDate: true // This is a date-only value
            });
            dtstart.setValue(startTime);
            dtstart.setParameter('value', 'DATE');
            vevent.addProperty(dtstart);
            
            // End date for all-day events
            const dtend = new ICAL.Property('dtend', vevent);
            const endTime = new ICAL.Time({
                year: event.end.getFullYear(),
                month: event.end.getMonth() + 1, // ICAL.js uses 1-based months
                day: event.end.getDate(),
                isDate: true // This is a date-only value
            });
            dtend.setValue(endTime);
            dtend.setParameter('value', 'DATE');
            vevent.addProperty(dtend);
            
            console.log(`  All-day event: ${startTime.year}-${startTime.month}-${startTime.day}`);
        } else {
            // Create proper datetime for timed events
            const dtstart = new ICAL.Property('dtstart', vevent);
            const startTime = new ICAL.Time({
                year: event.start.getFullYear(),
                month: event.start.getMonth() + 1, // ICAL.js uses 1-based months
                day: event.start.getDate(),
                hour: event.start.getHours(),
                minute: event.start.getMinutes(),
                second: 0,
                isDate: false
            });
            startTime.zone = ICAL.Timezone.utcTimezone;
            dtstart.setValue(startTime);
            vevent.addProperty(dtstart);
            
            // End time for timed events
            const dtend = new ICAL.Property('dtend', vevent);
            const endTime = new ICAL.Time({
                year: event.end.getFullYear(),
                month: event.end.getMonth() + 1, // ICAL.js uses 1-based months
                day: event.end.getDate(), 
                hour: event.end.getHours(),
                minute: event.end.getMinutes(),
                second: 0,
                isDate: false
            });
            endTime.zone = ICAL.Timezone.utcTimezone;
            dtend.setValue(endTime);
            vevent.addProperty(dtend);
            
            console.log(`  Timed event: ${startTime.year}-${startTime.month}-${startTime.day} ${startTime.hour}:${startTime.minute}`);
        }
        
        // Add location if available
        if (event.location) {
            const location = new ICAL.Property('location', vevent);
            location.setValue(event.location);
            vevent.addProperty(location);
        }
        
        // Add UID (required for valid iCal)
        const uid = new ICAL.Property('uid', vevent);
        uid.setValue(`${Date.now()}-${Math.random().toString(36).substring(2, 9)}@pdfcalendar.converter`);
        vevent.addProperty(uid);
        
        // Add timestamp
        const dtstamp = new ICAL.Property('dtstamp', vevent);
        const now = ICAL.Time.now();
        dtstamp.setValue(now);
        vevent.addProperty(dtstamp);
        
        // Add the event to the calendar
        calendarComponent.addSubcomponent(vevent);
    });
    
    return calendarComponent.toString();
}

// Function to add timezone component to iCal
function addTimezoneComponent(calendar, timezone) {
    // Create a basic VTIMEZONE component
    const vtimezone = new ICAL.Component('vtimezone');
    vtimezone.updatePropertyWithValue('tzid', timezone);
    
    // Create standard time component (Fall back - DST ends)
    const standard = new ICAL.Component('standard');
    const standardTime = new ICAL.Time({
        year: 1970,
        month: 11,
        day: 1,
        hour: 2,
        minute: 0,
        second: 0,
        isDate: false
    });
    standard.addPropertyWithValue('dtstart', standardTime);
    
    // Add RRULE property directly as a string - need to use specific format
    const standardRRule = new ICAL.Property('rrule', standard);
    standardRRule.setValue(new ICAL.Recur({ freq: 'YEARLY', byMonth: 11, byDay: [{ day: 1, week: 1 }] }));
    standard.addProperty(standardRRule);
    
    // UTC offsets must have format [+/-]HHMM[SS]
    standard.addPropertyWithValue('tzoffsetfrom', '-0400');
    standard.addPropertyWithValue('tzoffsetto', '-0500');
    standard.addPropertyWithValue('tzname', 'Standard Time');
    vtimezone.addSubcomponent(standard);
    
    // Create daylight time component (Spring forward - DST starts)
    const daylight = new ICAL.Component('daylight');
    const daylightTime = new ICAL.Time({
        year: 1970,
        month: 3,
        day: 8,
        hour: 2,
        minute: 0,
        second: 0,
        isDate: false
    });
    daylight.addPropertyWithValue('dtstart', daylightTime);
    
    // Add RRULE property
    const daylightRRule = new ICAL.Property('rrule', daylight);
    daylightRRule.setValue(new ICAL.Recur({ freq: 'YEARLY', byMonth: 3, byDay: [{ day: 0, week: 2 }] }));
    daylight.addProperty(daylightRRule);
    
    daylight.addPropertyWithValue('tzoffsetfrom', '-0500');
    daylight.addPropertyWithValue('tzoffsetto', '-0400');
    daylight.addPropertyWithValue('tzname', 'Daylight Time');
    vtimezone.addSubcomponent(daylight);
    
    // Add timezone to calendar
    calendar.addSubcomponent(vtimezone);
}