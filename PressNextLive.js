ObjC.import('Cocoa');
ObjC.import('ApplicationServices');

var app = Application.currentApplication();
app.includeStandardAdditions = true;

// A native menu item needs an Objective-C target. Guard the callback so an
// Objective-C bridge exception can never terminate playback.
try {
    ObjC.registerSubclass({
        name: 'PressNextLiveMenuController',
        methods: {
            'toggleTargetMode:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { toggleTargetMode(); } catch (ignored) {}
                }
            },
            'chooseTargetApplication:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { chooseTargetApplication(); } catch (ignored) {}
                }
            },
            'selectKnownTarget:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { selectKnownTarget(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'selectLyricsPosition:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { selectLyricsPosition(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'selectQuickTimeViewMode:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { selectQuickTimeViewMode(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'selectMenuLanguage:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { selectMenuLanguage(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'changeHotkey:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { changeHotkey(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'resetHotkeys:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { resetHotkeys(); } catch (ignored) {}
                }
            },
            'chooseBatchFiles:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { chooseBatchFiles(); } catch (ignored) {}
                }
            },
            'chooseBatchFolder:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { chooseBatchFolder(); } catch (ignored) {}
                }
            },
            'chooseBatchFontMenu:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { chooseBatchFont(); } catch (ignored) {}
                }
            },
            'changeBatchFont:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { changeBatchFont(sender); } catch (ignored) {}
                }
            },
            'selectBatchFormat:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { selectBatchFormat(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'chooseBatchColorMenu:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { chooseBatchColor(Number(sender.tag)); } catch (ignored) {}
                }
            },
            'changeBatchColor:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { changeBatchColor(sender); } catch (ignored) {}
                }
            },
            'startBatchFormattingMenu:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { startBatchFormatting(); } catch (ignored) {}
                }
            },
            'matchLyricsNamesMenu:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { matchLyricsNamesToTracks(); } catch (ignored) {}
                }
            },
            'resetManualSortingMenu:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { resetManualSongSorting(); } catch (ignored) {}
                }
            },
            'removeStartingTheMenu:': {
                types: ['void', ['id']],
                implementation: function(sender) {
                    try { removeStartingThe(); } catch (ignored) {}
                }
            }
        }
    });
} catch (ignored) {}

var playlist = [];
var folderNames = [];
var currentIndex = 0;
var currentAudioPath = null;
var currentCompanionPath = null;
var currentAudioDocumentID = null;
var currentCompanionDocumentID = null;
var currentViewerAppName = null;
var currentViewerBundleID = null;
var globalKeyMonitor = null;
var localKeyMonitor = null;
var pendingCommand = 0;
var pendingSeekSeconds = 0;
var pendingSeekDeadline = 0;
// Несколько быстрых нажатий громкости складываются в одну дБ-дельту — по
// той же схеме, что и перемотка выше. Складывать корректно именно в дБ:
// это логарифмическая шкала, поэтому дБ-дельты складываются напрямую, а
// не как линейные множители (которые пришлось бы перемножать).
var pendingVolumeDeltaDB = 0;
var pendingVolumeDeadline = 0;
var targetActivationDeadline = 0;
var targetActivationAttempts = 0;
var targetModeEnabled = true;
var targetAppPath = '';
var targetAppName = 'Logic Pro';
var lyricsPosition = 'left';
var menuLanguage = 'en';
var hotkeys = null;
var preferencesLoaded = false;
var settingsMenusInstalled = false;
var settingsMenuController = null;
// Все корневые пункты меню (File, Pedalboard app, Lyrics, ...), которые
// installSettingsMenus() добавляет в mainMenu через addRootMenu — нужно
// для полной пересборки при смене языка меню (см. rebuildSettingsMenus).
var installedRootMenuItems = [];
var menuLanguageMenuItems = [];
var targetModeMenuItem = null;
var targetCurrentMenuItem = null;
var targetKnownMenuItems = [];
var positionMenuItems = [];
var hotkeyMenuItems = [];
var quickTimeViewModeMenuItems = [];
// 'half' — видна верхняя половина окна (заголовок + бегунок с таймингом),
// нижняя уезжает за нижний край экрана. 'full' — видно всё окно целиком.
var quickTimeViewMode = 'half';
// Короткая серия повторных попыток разместить окно QuickTime сразу после
// открытия песни — на случай, если сам QuickTime подвинет/растянет окно
// через долю секунды после того, как мы его уже поставили на место.
var quickTimeStripSettleDeadline = 0;
var quickTimeStripSettleAttempts = 0;
var fileChooserIsOpen = false;
var busy = false;
var paused = false;
var started = false;
var permissionMessageShown = false;
var secondMonitorWarningShown = false;

// The first activation attempt happens almost immediately after QuickTime and
// QuickTime and the companion viewer have confirmed that their documents are
// open. Subsequent attempts
// verify the result without blocking playback or keyboard handling.
var TARGET_INITIAL_ACTIVATION_DELAY_MS = 50;
var TARGET_ACTIVATION_RETRY_DELAY_MS = 100;
var TARGET_ACTIVATION_MAX_ATTEMPTS = 8;
var TARGET_MODE_DEFAULTS_KEY = 'TargetModeEnabled';
var TARGET_APP_PATH_DEFAULTS_KEY = 'TargetApplicationPath';
var TARGET_APP_NAME_DEFAULTS_KEY = 'TargetApplicationName';
var LYRICS_POSITION_DEFAULTS_KEY = 'LyricsPosition';
var QUICKTIME_VIEW_MODE_DEFAULTS_KEY = 'QuickTimeViewMode';
var MENU_LANGUAGE_DEFAULTS_KEY = 'MenuLanguage';
var HOTKEYS_DEFAULTS_KEY = 'HotkeysJSON';

var QUICKTIME_BUNDLE_ID = 'com.apple.QuickTimePlayerX';
// Серия повторных попыток сразу после открытия песни: 1 немедленная
// попытка плюс эти 5 — с интервалом 300 мс, то есть всё укладывается
// примерно в 1.5 секунды. Дальше, до конца песни, ни одной попытки больше.
var QUICKTIME_STRIP_SETTLE_RETRY_COUNT = 5;
var QUICKTIME_STRIP_SETTLE_RETRY_INTERVAL_MS = 300;

// Громкость документа в QuickTime Player — линейная величина (1.0 = 100%,
// вплоть до 3.0 = 300% усиления у самого QuickTime), а не децибелы. Шаг в
// дБ переводится в множитель по стандартной формуле амплитуды:
// 10^(дБ/20). Например, +2 дБ ≈ ×1.259, −2 дБ ≈ ×0.794 — то есть шаг не
// фиксированный по величине, а всегда пропорционален текущей громкости,
// как и положено на логарифмической шкале восприятия громкости.
var QUICKTIME_VOLUME_STEP_DB = 2;
// Потолок в 2.0 (примерно +6 дБ над номинальными 100%) — запас на случай
// тихой записи, но без риска резкого, неожиданно громкого скачка на сцене.
var QUICKTIME_VOLUME_MAX = 2.0;
var QUICKTIME_VOLUME_MIN = 0.0;

var KNOWN_TARGETS = ['Logic Pro', 'MainStage', 'Gig Performer', 'REAPER'];
var POSITION_VALUES = ['left', 'right', 'second'];
var POSITION_TITLES = {
    en: ['Left', 'Right', 'Second display'],
    ru: ['Слева', 'Справа', 'Второй монитор']
};
var QUICKTIME_VIEW_MODE_VALUES = ['full', 'half'];
var QUICKTIME_VIEW_MODE_TITLES = {
    en: ['Whole window', 'Top of window (scrubber only)'],
    ru: ['Целое окно', 'Верх окна (только ползунок)']
};
// Значения языка меню; сами названия языков ('English' / 'Русский') нигде
// не переводятся — как и везде в macOS, каждый язык всегда подписан на
// самом себе, чтобы его можно было найти, даже не читая текущий язык меню.
var MENU_LANGUAGE_VALUES = ['en', 'ru'];
var MENU_LANGUAGE_TITLES = ['English', 'Русский'];

// ---- Batch lyrics formatter state ----
var batchFiles = [];
var batchFontName = '';
var batchSaveFolder = '';
var batchSaveFormat = 'png';
var batchVerseColorHex = 'FFFFFF';
var batchChorusColorHex = 'FFB347';
var batchBridgeColorHex = '5FC9F3';
var colorPickerContext = 'verse';
// Состояние прогона пакетной обработки. Файлы обрабатываются по одному за
// такт цикла простоя (см. startBatchFormatting), поэтому состояние живёт
// между тактами здесь, а не в локальных переменных одного цикла.
var batchRunning = false;
var batchQueue = [];
var batchTotal = 0;
var batchSucceeded = 0;
var batchFailed = [];
var batchOverflowed = [];
var batchDeadline = 0;
// Сводка показывается отдельным, более поздним тактом — см.
// finishBatchFormatting.
var batchSummaryPending = null;
var batchSummaryDeadline = 0;
// Папка, в которую пишется журнал для текущей отложенной сводки: у
// форматирования это папка сохранения, у переименования — папка, где
// переименовывались файлы.
var batchSummaryFolder = '';
var batchLogLines = [];
var batchFilesInfoItem = null;
var batchFontInfoItem = null;
var batchFolderInfoItem = null;
var batchFormatMenuItems = [];
var batchVerseColorItem = null;
var batchChorusColorItem = null;
var batchBridgeColorItem = null;

var BATCH_FORMAT_VALUES = ['png', 'jpg', 'pdf'];
var BATCH_FORMAT_TITLES = ['PNG', 'JPG', 'PDF'];
var BATCH_FONT_NAME_DEFAULTS_KEY = 'BatchFontName';
var BATCH_SAVE_FOLDER_DEFAULTS_KEY = 'BatchSaveFolder';
var BATCH_SAVE_FORMAT_DEFAULTS_KEY = 'BatchSaveFormat';
var BATCH_VERSE_COLOR_DEFAULTS_KEY = 'BatchVerseColorHex';
var BATCH_CHORUS_COLOR_DEFAULTS_KEY = 'BatchChorusColorHex';
var BATCH_BRIDGE_COLOR_DEFAULTS_KEY = 'BatchBridgeColorHex';

var CANVAS_WIDTH = 1400;
var CANVAS_HEIGHT = 1960;
// Минимальные поля картинки: не более 8 px с каждой стороны.
var MARGIN_X = 8;
var MARGIN_Y = 8;
// Верхняя граница кегля намеренно высокая: иначе короткий текст упирался
// в потолок в 160 pt и оставлял вокруг себя пустое поле в сотни пикселей.
var MAX_FONT_SIZE = 480;
var MIN_FONT_SIZE = 26;
// Насколько межстрочный интервал имеет право вырасти, чтобы добрать
// оставшуюся высоту кадра (доля от базовой высоты строки).
var MAX_EXTRA_LEADING_RATIO = 0.45;
var TARGET_MAX_BYTES = 300 * 1024;
var NS_BITMAP_FILETYPE_JPEG = 3;
var NS_BITMAP_FILETYPE_PNG = 4;
var NS_UTF8_STRING_ENCODING = 4;

var FALLBACK_FONT_CHAIN = [
    'BebasNeue-Regular', 'BebasNeue', 'Bebas Neue', 'Bebas-Regular',
    'HelveticaNeue-CondensedBlack', 'HelveticaNeue-CondensedBold',
    'ArialNarrow-Bold', 'Arial-BoldMT',
    'AvenirNextCondensed-Heavy', 'AvenirNextCondensed-Bold',
    'Helvetica-Bold'
];

var SHORT_LINE_MAX_WORDS = 2;
var SHORT_LINE_MAX_CHARS = 14;

// A later paragraph close enough to a chorus/bridge reference (edit distance
// on the normalized text) counts as a repeat of it ("+VAR CHORUS"/"+VAR
// BRIDGE" instead of an exact "+CHORUS"/"+BRIDGE"). Допуск считается от
// длины строфы: базовые 15 знаков, но не меньше VARIATION_MIN_RATIO и не
// больше VARIATION_MAX_RATIO от длины более короткой из двух строф.
var MAX_VARIATION_DISTANCE = 15;
var VARIATION_MIN_RATIO = 0.10;
var VARIATION_MAX_RATIO = 0.20;

// Минимальная длина строфы (знаков без пробелов), которую эвристика имеет
// право объявить припевом/бриджем без явной метки. Спасает от того, чтобы
// повторяющееся "о-о-о" или одна короткая строка стали "припевом".
var AUTO_SECTION_MIN_CHARS = 14;

// Fixed "readability" colors cycled across paragraphs when a song has no
// chorus or bridge at all (neither tagged nor auto-detected): white, then
// these two, purely so consecutive verses are easier to tell apart at a
// glance. голубой / светло-зелёный.
var VERSE_ALT_COLOR_1_HEX = '5FC9F3';
var VERSE_ALT_COLOR_2_HEX = '90EE90';

var VOCALISE_SYLLABLES = ['o', 'oh', 'ooh', 'oooh', 'ah', 'aah', 'aaah', 'a', 'uh', 'uhh', 'mm', 'mmm',
    'hm', 'hmm', 'na', 'la', 'da', 'lu', 'loo', 'doo', 'du', 'wo', 'woh', 'woah', 'whoa',
    'ла', 'о', 'ах', 'на', 'ой', 'ух', 'хм'];

// Ключевые слова меток строф. Строка сравнивается с ними после разбора
// в parseSectionTag (скобки, номер, повтор, двоеточие уже сняты).
//   chorus/bridge — рабочие метки;
//   verse         — явный куплет: в автопоиск повторов не берётся;
//   other         — интро/проигрыш/кода: только разделитель блоков.
var SECTION_KEYWORDS = [
    {type: 'chorus', words: ['chorus', 'refrain', 'hook', 'припев', 'припева', 'рефрен', 'прип', 'п р и п е в']},
    {type: 'bridge', words: ['bridge', 'бридж', 'бриджа', 'переход']},
    {type: 'verse', words: ['verse', 'strophe', 'куплет', 'куплета', 'pre chorus', 'prechorus', 'предприпев', 'предприпева']},
    {type: 'other', words: ['intro', 'outro', 'coda', 'instrumental', 'solo', 'interlude', 'break',
        'интро', 'аутро', 'вступление', 'кода', 'проигрыш', 'соло', 'инструментал']}
];

var ACTION_DEFINITIONS = [
    {id: 'seekBack', titles: {en: 'Back 10 seconds', ru: 'Назад на 10 секунд'}, defaultKey: '←'},
    {id: 'seekForward', titles: {en: 'Forward 10 seconds', ru: 'Вперёд на 10 секунд'}, defaultKey: '→'},
    {id: 'previousTrack', titles: {en: 'Previous song', ru: 'Предыдущая песня'}, defaultKey: '↑'},
    {id: 'nextTrack', titles: {en: 'Next song', ru: 'Следующая песня'}, defaultKey: '↓'},
    {id: 'stop', titles: {en: 'Stop and close', ru: 'Остановить и закрыть'}, defaultKey: 'Esc'},
    {id: 'pause', titles: {en: 'Pause / resume', ru: 'Пауза / продолжить'}, defaultKey: 'Space'},
    {id: 'volumeDown', titles: {en: 'QuickTime volume down 2 dB', ru: 'QuickTime тише на 2 дБ'}, defaultKey: 'Cmd+↓'},
    {id: 'volumeUp', titles: {en: 'QuickTime volume up 2 dB', ru: 'QuickTime громче на 2 дБ'}, defaultKey: 'Cmd+↑'},
    {id: 'open', titles: {en: 'Choose song', ru: 'Выбрать песню'}, defaultKey: 'Cmd+O'},
    {id: 'quit', titles: {en: 'Quit PressNext Live', ru: 'Завершить PressNext Live'}, defaultKey: 'Cmd+Q'}
];

function actionTitle(definition) {
    return (definition.titles[menuLanguage] !== undefined ? definition.titles[menuLanguage] : definition.titles.en);
}

// Все переводимые строки меню (и нескольких диалогов, напрямую и без
// промежуточных шагов открывающихся из пунктов меню) в одном месте.
// T(key) возвращает строку на текущем языке меню с откатом на английский.
var MENU_STRINGS = {
    en: {
        fileMenu: 'File',
        menuLanguageSubmenu: 'Menu language',
        pedalboardMenu: 'Pedalboard app',
        activateAfterStart: 'Activate after start',
        chooseAnotherApp: 'Choose another app…',
        selectedPrefix: 'Selected: ',
        none: 'none',
        chooseAppPrompt: 'Choose the app to activate after the song starts',
        chooseSongPrompt: 'Choose the starting MP3 or WAV song',
        lyricsMenu: 'Lyrics',
        playerViewMenu: 'Player view',
        hotkeysMenu: 'Hotkeys',
        restoreDefaultHotkeys: 'Restore default hotkeys',
        chooseKeyPromptPrefix: 'Choose a key for the action “',
        chooseKeyPromptSuffix: '”',
        assignButton: 'Assign',
        cancelButton: 'Cancel',
        restoreHotkeysQuestion: 'Restore all default hotkeys?',
        restoreButton: 'Restore',
        keyTakenPrefix: 'The key ',
        keyTakenMiddle: ' is already assigned to “',
        keyTakenSuffix: '”.',
        batchMenu: 'Batch format lyrics',
        chooseFiles: 'Choose files…',
        chooseFilesPrompt: 'Choose lyrics files (TXT, DOCX, RTF)',
        filesSelectedPrefix: 'Files selected: ',
        chooseFont: 'Choose font…',
        fontPrefix: 'Font: ',
        fontAutoPrefix: 'auto (',
        systemFont: 'system',
        chooseSaveFolder: 'Save folder…',
        chooseSaveFolderPrompt: 'Choose a folder to save the images',
        folderPrefix: 'Folder: ',
        folderNotSelected: 'not selected',
        saveFormat: 'Save format',
        verseColorPrefix: 'Verse color… (#',
        chorusColorPrefix: 'Chorus color… (#',
        bridgeColorPrefix: 'Bridge color… (#',
        errCloseConfirmRetry: 'Could not confirm that the current song was closed. PressNext Live has been left running so the command can be repeated.',
        errNeedAppBundle: 'You need to choose an application file with the .app extension.',
        errCloseBeforeChooser: 'Could not close the current song. The chooser was not opened, to avoid starting two songs at once.',
        errNotAudioFile: 'The selected file is not an MP3 or WAV.',
        errFolderUnreadable: 'Could not read the selected folder.',
        errNoAudioInFolder: 'There are no MP3 or WAV files in the selected folder.',
        errCloseConfirmQuit: 'Could not confirm that the current song was closed. PressNext Live has not quit, so the audio does not keep playing without control.',
        errClosePrevious: 'Could not close the previous song. The new song was not started, to avoid simultaneous playback.',
        errOpenSongClosed: 'Could not open the song. The partially opened document was closed.',
        errOpenSongUnconfirmed: 'Could not open the song, and could not confirm that the partially opened document was closed.',
        errLyricsClosed: 'The song opened but the lyrics file did not. The partially opened documents were closed.',
        errLyricsUnconfirmed: 'Error opening the lyrics file: could not confirm that the partially opened documents were closed.',
        errNoSecondDisplay: 'No second display found. The lyrics window was placed on the left of the main screen.',
        errBatchNoFiles: 'First choose the lyrics files via “Choose files…”.',
        errBatchNoFolder: 'First choose a save folder via “Save folder…”.',
        errColorPanel: 'Could not open the color picker.',
        errFontPanel: 'Could not open the font picker.',
        permissionTitle: 'One permission needed',
        permissionButton: 'Got it',
        permissionMessage: 'Enable “PressNext Live” under “Privacy & Security → Accessibility”, then restart the app. This is needed to handle the assigned keys while the QuickTime, Preview, TextEdit or chosen DAW window is active.',
        batchSummaryPrefix: 'Done. Successfully processed: ',
        batchSummaryMiddle: ' of ',
        batchOverflowNote: '\n\nThe lyrics did not fit completely even at the smallest font size (the file was saved anyway):\n',
        batchFailedNote: '\n\nCould not process:\n',
        errNoText: 'could not read the text of the file',
        errNoLyrics: 'no lyrics found in the file',
        errNoData: 'no data to save',
        errWriteFailed: 'could not write the file to disk',
        skipNoMatch: 'no matching backing track',
        andMorePrefix: '\n… and ',
        andMoreSuffix: ' more (full list in PressNextLive-batch-log.txt)',
        matchLyricsNames: 'Match lyrics names to tracks…',
        resetSorting: 'Reset manual song sorting…',
        removeStartingThe: 'Remove starting "The"…',
        removeThePrompt: 'Choose the files to remove a leading "The" from',
        removeTheConfirmPrefix: 'Remove the leading "The" from ',
        removeTheConfirmSuffix: ' file name(s)?',
        skipNoThe: 'does not start with "The"',
        matchFolderPrompt: 'Choose the folder with backing tracks and lyrics files',
        resetFilesPrompt: 'Choose the files to remove the first 3 characters from',
        renameConfirmButton: 'Rename',
        matchNothingToDo: 'Nothing to rename: every lyrics file next to a track already matches its name.',
        matchNoPairs: 'No lyrics files matching a backing track were found in this folder.',
        matchConfirmPrefix: 'Rename ',
        matchConfirmSuffix: ' lyrics file(s) to match their backing tracks?',
        resetConfirmPrefix: 'Remove the first 3 characters from the names of ',
        resetConfirmSuffix: ' file(s)?',
        resetTooShort: 'Skipped (name too short): ',
        renameExamples: '\n\nFor example:\n',
        renameDonePrefix: 'Renamed: ',
        renameSkippedNote: '\n\nSkipped:\n',
        skipExists: 'a file with the target name already exists',
        skipAmbiguous: 'matches more than one backing track',
        skipFailed: 'the system refused to rename it',
        startFormatting: 'Start formatting'
    },
    ru: {
        fileMenu: 'Файл',
        menuLanguageSubmenu: 'Язык меню',
        pedalboardMenu: 'Приложение',
        activateAfterStart: 'Активировать после старта',
        chooseAnotherApp: 'Выбрать другое приложение…',
        selectedPrefix: 'Выбрано: ',
        none: 'нет',
        chooseAppPrompt: 'Выберите приложение, которое нужно активировать после запуска песни',
        chooseSongPrompt: 'Выберите начальную песню MP3 или WAV',
        lyricsMenu: 'Текст',
        playerViewMenu: 'Плеер: вид',
        hotkeysMenu: 'Клавиши',
        restoreDefaultHotkeys: 'Вернуть стандартные клавиши',
        chooseKeyPromptPrefix: 'Выберите клавишу для действия «',
        chooseKeyPromptSuffix: '»',
        assignButton: 'Назначить',
        cancelButton: 'Отмена',
        restoreHotkeysQuestion: 'Вернуть все стандартные горячие клавиши?',
        restoreButton: 'Вернуть',
        keyTakenPrefix: 'Клавиша ',
        keyTakenMiddle: ' уже назначена действию «',
        keyTakenSuffix: '».',
        batchMenu: 'Пакетное форматирование',
        chooseFiles: 'Выбрать файлы…',
        chooseFilesPrompt: 'Выберите файлы с текстами песен (TXT, DOCX, RTF)',
        filesSelectedPrefix: 'Выбрано файлов: ',
        chooseFont: 'Выбрать шрифт…',
        fontPrefix: 'Шрифт: ',
        fontAutoPrefix: 'авто (',
        systemFont: 'системный',
        chooseSaveFolder: 'Папка для сохранения…',
        chooseSaveFolderPrompt: 'Выберите папку для сохранения изображений',
        folderPrefix: 'Папка: ',
        folderNotSelected: 'не выбрана',
        saveFormat: 'Формат сохранения',
        verseColorPrefix: 'Цвет куплета… (#',
        chorusColorPrefix: 'Цвет припева… (#',
        bridgeColorPrefix: 'Цвет бриджа… (#',
        errCloseConfirmRetry: 'Не удалось подтвердить закрытие текущей песни. PressNext Live оставлен запущенным, чтобы можно было повторить команду.',
        errNeedAppBundle: 'Нужно выбрать файл приложения с расширением .app.',
        errCloseBeforeChooser: 'Не удалось закрыть текущую песню. Меню выбора не открыто, чтобы не запустить две песни одновременно.',
        errNotAudioFile: 'Выбранный файл не является MP3 или WAV.',
        errFolderUnreadable: 'Не удалось прочитать выбранную папку.',
        errNoAudioInFolder: 'В выбранной папке нет MP3 или WAV.',
        errCloseConfirmQuit: 'Не удалось подтвердить закрытие текущей песни. PressNext Live не завершён, чтобы звук не остался играть без управления.',
        errClosePrevious: 'Не удалось закрыть предыдущую песню. Новая песня не была запущена, чтобы избежать одновременного воспроизведения.',
        errOpenSongClosed: 'Не удалось открыть песню. Частично открытый документ был закрыт.',
        errOpenSongUnconfirmed: 'Не удалось открыть песню и подтвердить закрытие частично открытого документа.',
        errLyricsClosed: 'Песня открылась, но файл текста — нет. Частично открытые документы были закрыты.',
        errLyricsUnconfirmed: 'Ошибка открытия файла текста: не удалось подтвердить закрытие частично открытых документов.',
        errNoSecondDisplay: 'Второй монитор не найден. Окно текста размещено слева на основном экране.',
        errBatchNoFiles: 'Сначала выберите файлы с текстами песен через «Выбрать файлы…».',
        errBatchNoFolder: 'Сначала выберите папку для сохранения через «Папка для сохранения…».',
        errColorPanel: 'Не удалось открыть панель выбора цвета.',
        errFontPanel: 'Не удалось открыть панель выбора шрифта.',
        permissionTitle: 'Нужно одно разрешение',
        permissionButton: 'Понятно',
        permissionMessage: 'Включите «PressNext Live» в разделе «Конфиденциальность и безопасность → Универсальный доступ», затем перезапустите приложение. Это нужно для управления назначенными клавишами, когда активно окно QuickTime, Preview, TextEdit или выбранной DAW.',
        batchSummaryPrefix: 'Готово. Успешно обработано: ',
        batchSummaryMiddle: ' из ',
        batchOverflowNote: '\n\nТекст не поместился полностью даже при минимальном размере шрифта (файл всё равно сохранён):\n',
        batchFailedNote: '\n\nНе удалось обработать:\n',
        errNoText: 'не удалось прочитать текст файла',
        errNoLyrics: 'в файле не найден текст песни',
        errNoData: 'нет данных для сохранения',
        errWriteFailed: 'не удалось записать файл на диск',
        skipNoMatch: 'нет подходящей минусовки',
        andMorePrefix: '\n… и ещё ',
        andMoreSuffix: ' (полный список в PressNextLive-batch-log.txt)',
        matchLyricsNames: 'Подогнать имена текстов под минусовки…',
        resetSorting: 'Сбросить ручную сортировку…',
        removeStartingThe: 'Убрать The в начале имени…',
        removeThePrompt: 'Выберите файлы, у которых нужно убрать The в начале имени',
        removeTheConfirmPrefix: 'Убрать The в начале у ',
        removeTheConfirmSuffix: ' имён файлов?',
        skipNoThe: 'имя не начинается с The',
        matchFolderPrompt: 'Выберите папку с минусовками и файлами текстов',
        resetFilesPrompt: 'Выберите файлы, у которых нужно убрать первые 3 знака',
        renameConfirmButton: 'Переименовать',
        matchNothingToDo: 'Переименовывать нечего: имена всех файлов текстов уже совпадают с минусовками.',
        matchNoPairs: 'В этой папке не нашлось файлов текстов, подходящих к минусовкам.',
        matchConfirmPrefix: 'Переименовать ',
        matchConfirmSuffix: ' файл(ов) текстов под имена минусовок?',
        resetConfirmPrefix: 'Убрать первые 3 знака из имён ',
        resetConfirmSuffix: ' файл(ов)?',
        resetTooShort: 'Пропущено (слишком короткое имя): ',
        renameExamples: '\n\nНапример:\n',
        renameDonePrefix: 'Переименовано: ',
        renameSkippedNote: '\n\nПропущено:\n',
        skipExists: 'файл с таким именем уже существует',
        skipAmbiguous: 'подходит больше чем к одной минусовке',
        skipFailed: 'система отказалась переименовать',
        startFormatting: 'Начать форматирование'
    }
};

function T(key) {
    var table = MENU_STRINGS[menuLanguage] || MENU_STRINGS.en;
    if (table[key] !== undefined) return table[key];
    return MENU_STRINGS.en[key] !== undefined ? MENU_STRINGS.en[key] : key;
}

var MODIFIER_SHIFT = 1 << 17;
var MODIFIER_CONTROL = 1 << 18;
var MODIFIER_OPTION = 1 << 19;
var MODIFIER_COMMAND = 1 << 20;
var RELEVANT_MODIFIER_MASK = MODIFIER_SHIFT | MODIFIER_CONTROL | MODIFIER_OPTION | MODIFIER_COMMAND;
var HOTKEY_CHOICES = createHotkeyChoices();

function run(argv) {
    ensureStarted();

    if (argv && argv.length > 0 && isSupportedAudio(String(argv[0]))) {
        loadPlaylist(String(argv[0]));
    } else if (playlist.length === 0) {
        chooseStartingSong();
    }

    return true;
}

function openDocuments(documents) {
    ensureStarted();
    if (documents && documents.length > 0) {
        var selectedPath = String(documents[0]);
        if (isSupportedAudio(selectedPath)) {
            loadPlaylist(selectedPath);
        }
    }
}

function idle() {
    ensureStarted();
    installSettingsMenus();
    installKeyboardMonitorsWhenAllowed();

    if (pendingCommand !== 0 && !busy) {
        var command = pendingCommand;
        pendingCommand = 0;

        if (command === 4) {
            quitPlayer();
            return 1;
        }
        if (command === -1 || command === 1 || command === 3 || command === 6) {
            pendingSeekSeconds = 0;
            pendingSeekDeadline = 0;
            pendingVolumeDeltaDB = 0;
            pendingVolumeDeadline = 0;
        }
        if (command === -1) previousTrack();
        if (command === 1) nextTrack();
        if (command === 3 && !closeCurrentDocuments(true)) {
            showError(T('errCloseConfirmRetry'));
        }
        if (command === 5) togglePause();
        if (command === 6) reopenSongChooser();

        return nextIdleInterval();
    }

    // Several rapid arrow presses are combined into one QuickTime command.
    // This avoids asking QuickTime to update the same document repeatedly while
    // it is still processing the previous seek operation.
    if (pendingSeekSeconds !== 0 && !busy && Date.now() >= pendingSeekDeadline) {
        var seekAmount = pendingSeekSeconds;
        pendingSeekSeconds = 0;
        pendingSeekDeadline = 0;
        busy = true;
        seekBy(seekAmount);
        busy = false;
        return nextIdleInterval();
    }

    // Несколько быстрых нажатий громкости складываются в одну дБ-дельту —
    // ровно та же схема, что и перемотка выше.
    if (pendingVolumeDeltaDB !== 0 && !busy && Date.now() >= pendingVolumeDeadline) {
        var volumeDeltaDB = pendingVolumeDeltaDB;
        pendingVolumeDeltaDB = 0;
        pendingVolumeDeadline = 0;
        busy = true;
        adjustQuickTimeVolume(volumeDeltaDB);
        busy = false;
        return nextIdleInterval();
    }

    if (targetActivationDeadline !== 0 &&
        !busy &&
        currentAudioPath !== null &&
        Date.now() >= targetActivationDeadline) {
        targetActivationDeadline = 0;
        processTargetActivation();
        return nextIdleInterval();
    }

    // QuickTime иногда сам перестраивает своё окно вскоре после открытия
    // файла (например, когда становится известна длительность). Короткая
    // серия повторных попыток перекрывает этот момент; после неё, до конца
    // песни, окна больше не трогаются ни разу.
    if (quickTimeStripSettleDeadline !== 0 &&
        !busy &&
        currentAudioPath !== null &&
        Date.now() >= quickTimeStripSettleDeadline) {
        quickTimeStripSettleDeadline = 0;
        processQuickTimeStripSettle();
        return nextIdleInterval();
    }

    // Пакетная обработка: один файл за такт. Стоит перед checkForEndOfTrack,
    // чтобы прогон шёл без задержек, и требует !busy — так шаг не наложится
    // на открытие или закрытие песни.
    if (batchRunning && !busy && Date.now() >= batchDeadline) {
        busy = true;
        try {
            processBatchStep();
        } catch (error) {
            // Прогон не должен застревать из-за сбоя на одном файле.
            cancelBatchFormatting();
        }
        busy = false;
        return nextIdleInterval();
    }

    // Отложенный показ сводки: отдельным тактом, уже не сразу после
    // отрисовки последнего файла.
    if (batchSummaryPending !== null && !busy && Date.now() >= batchSummaryDeadline) {
        busy = true;
        try {
            showPendingBatchSummary();
        } catch (error) {
            batchSummaryPending = null;
            batchSummaryDeadline = 0;
        }
        busy = false;
        return nextIdleInterval();
    }

    checkForEndOfTrack();
    return nextIdleInterval();
}

function nextIdleInterval() {
    // Пока идёт пакетная обработка — самый короткий такт: между файлами
    // нужно лишь вернуться в цикл событий, чтобы он освободил временные
    // объекты AppKit.
    if (batchRunning || batchSummaryPending !== null) return 0.05;

    if (targetActivationDeadline === 0 && quickTimeStripSettleDeadline === 0) return 0.25;

    var nextDeadline = null;
    if (targetActivationDeadline !== 0) nextDeadline = targetActivationDeadline;
    if (quickTimeStripSettleDeadline !== 0 &&
        (nextDeadline === null || quickTimeStripSettleDeadline < nextDeadline)) {
        nextDeadline = quickTimeStripSettleDeadline;
    }

    var remainingSeconds = (nextDeadline - Date.now()) / 1000;
    if (remainingSeconds <= 0.05) return 0.05;
    return Math.min(0.25, remainingSeconds);
}

function scheduleTargetActivation() {
    if (!targetModeEnabled) {
        cancelTargetActivation();
        return;
    }

    targetActivationAttempts = 0;
    targetActivationDeadline = Date.now() + TARGET_INITIAL_ACTIVATION_DELAY_MS;
}

function cancelTargetActivation() {
    targetActivationDeadline = 0;
    targetActivationAttempts = 0;
}

function processTargetActivation() {
    if (!targetModeEnabled) {
        cancelTargetActivation();
        return;
    }

    if (targetApplicationIsFrontmost()) {
        cancelTargetActivation();
        return;
    }

    targetActivationAttempts += 1;
    activateTargetApplication();

    // Launch Services may accept the activation request before macOS visibly
    // changes focus. Recheck shortly instead of adding a long fixed delay.
    if (!targetApplicationIsFrontmost() && targetActivationAttempts < TARGET_ACTIVATION_MAX_ATTEMPTS) {
        targetActivationDeadline = Date.now() + TARGET_ACTIVATION_RETRY_DELAY_MS;
    } else {
        cancelTargetActivation();
    }
}

function ensureStarted() {
    if (started) return;
    started = true;
    loadPreferences();
    installSettingsMenus();
    requestKeyboardPermissionIfNeeded();
    installKeyboardMonitorsWhenAllowed();
}

function loadPreferences() {
    if (preferencesLoaded) return;
    preferencesLoaded = true;

    try {
        var defaults = $.NSUserDefaults.standardUserDefaults;
        var storedValue = defaults.objectForKey(
            $.NSString.stringWithString(TARGET_MODE_DEFAULTS_KEY)
        );
        if (storedValue !== null && storedValue !== undefined) {
            targetModeEnabled = Boolean(storedValue.boolValue);
        }

        targetAppPath = readStringDefault(defaults, TARGET_APP_PATH_DEFAULTS_KEY, '');
        targetAppName = readStringDefault(defaults, TARGET_APP_NAME_DEFAULTS_KEY, 'Logic Pro');
        if (targetAppName === '' && targetAppPath !== '') targetAppName = baseName(fileName(targetAppPath));

        lyricsPosition = readStringDefault(defaults, LYRICS_POSITION_DEFAULTS_KEY, 'left');
        if (POSITION_VALUES.indexOf(lyricsPosition) < 0) lyricsPosition = 'left';

        quickTimeViewMode = readStringDefault(defaults, QUICKTIME_VIEW_MODE_DEFAULTS_KEY, 'half');
        if (QUICKTIME_VIEW_MODE_VALUES.indexOf(quickTimeViewMode) < 0) quickTimeViewMode = 'half';

        menuLanguage = readStringDefault(defaults, MENU_LANGUAGE_DEFAULTS_KEY, 'en');
        if (MENU_LANGUAGE_VALUES.indexOf(menuLanguage) < 0) menuLanguage = 'en';

        hotkeys = defaultHotkeys();
        var storedHotkeys = readStringDefault(defaults, HOTKEYS_DEFAULTS_KEY, '');
        if (storedHotkeys !== '') {
            try {
                var parsedHotkeys = JSON.parse(storedHotkeys);
                for (var i = 0; i < ACTION_DEFINITIONS.length; i++) {
                    var actionID = ACTION_DEFINITIONS[i].id;
                    if (hotkeyChoiceForLabel(parsedHotkeys[actionID]) !== null) {
                        hotkeys[actionID] = parsedHotkeys[actionID];
                    }
                }
                if (!hotkeysAreUnique(hotkeys)) hotkeys = defaultHotkeys();
            } catch (ignored) {
                hotkeys = defaultHotkeys();
            }
        }

        batchFontName = readStringDefault(defaults, BATCH_FONT_NAME_DEFAULTS_KEY, '');
        if (batchFontName === 'undefined' || batchFontName === 'null' || batchFontName === '[object Object]') {
            batchFontName = '';
        }
        batchSaveFolder = readStringDefault(defaults, BATCH_SAVE_FOLDER_DEFAULTS_KEY, '');
        batchSaveFormat = readStringDefault(defaults, BATCH_SAVE_FORMAT_DEFAULTS_KEY, 'png');
        if (BATCH_FORMAT_VALUES.indexOf(batchSaveFormat) < 0) batchSaveFormat = 'png';
        batchVerseColorHex = readStringDefault(defaults, BATCH_VERSE_COLOR_DEFAULTS_KEY, 'FFFFFF');
        batchChorusColorHex = readStringDefault(defaults, BATCH_CHORUS_COLOR_DEFAULTS_KEY, 'FFB347');
        batchBridgeColorHex = readStringDefault(defaults, BATCH_BRIDGE_COLOR_DEFAULTS_KEY, '5FC9F3');
    } catch (error) {
        targetModeEnabled = true;
        targetAppPath = '';
        targetAppName = 'Logic Pro';
        lyricsPosition = 'left';
        quickTimeViewMode = 'half';
        menuLanguage = 'en';
        hotkeys = defaultHotkeys();
        batchFontName = '';
        batchSaveFolder = '';
        batchSaveFormat = 'png';
        batchVerseColorHex = 'FFFFFF';
        batchChorusColorHex = 'FFB347';
        batchBridgeColorHex = '5FC9F3';
    }
}

function readStringDefault(defaults, key, fallback) {
    try {
        var value = defaults.stringForKey($.NSString.stringWithString(key));
        if (value === null || value === undefined) return fallback;
        return String(ObjC.unwrap(value));
    } catch (error) {
        return fallback;
    }
}

function savePreferences() {
    try {
        var defaults = $.NSUserDefaults.standardUserDefaults;
        defaults.setBoolForKey(
            Boolean(targetModeEnabled),
            $.NSString.stringWithString(TARGET_MODE_DEFAULTS_KEY)
        );
        defaults.setObjectForKey($.NSString.stringWithString(targetAppPath), $.NSString.stringWithString(TARGET_APP_PATH_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(targetAppName), $.NSString.stringWithString(TARGET_APP_NAME_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(lyricsPosition), $.NSString.stringWithString(LYRICS_POSITION_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(quickTimeViewMode), $.NSString.stringWithString(QUICKTIME_VIEW_MODE_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(menuLanguage), $.NSString.stringWithString(MENU_LANGUAGE_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(JSON.stringify(hotkeys)), $.NSString.stringWithString(HOTKEYS_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(batchFontName), $.NSString.stringWithString(BATCH_FONT_NAME_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(batchSaveFolder), $.NSString.stringWithString(BATCH_SAVE_FOLDER_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(batchSaveFormat), $.NSString.stringWithString(BATCH_SAVE_FORMAT_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(batchVerseColorHex), $.NSString.stringWithString(BATCH_VERSE_COLOR_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(batchChorusColorHex), $.NSString.stringWithString(BATCH_CHORUS_COLOR_DEFAULTS_KEY));
        defaults.setObjectForKey($.NSString.stringWithString(batchBridgeColorHex), $.NSString.stringWithString(BATCH_BRIDGE_COLOR_DEFAULTS_KEY));
        defaults.synchronize;
    } catch (ignored) {}
}

function installSettingsMenus() {
    if (settingsMenusInstalled) return;

    try {
        var mainMenu = $.NSApplication.sharedApplication.mainMenu;
        if (mainMenu === null || mainMenu === undefined) return;

        settingsMenuController = $.PressNextLiveMenuController.alloc.init;
        installedRootMenuItems = [];

        var fileMenu = makeMenu(T('fileMenu'));
        var languageMenu = makeMenu(T('menuLanguageSubmenu'));
        menuLanguageMenuItems = [];
        for (var lg = 0; lg < MENU_LANGUAGE_VALUES.length; lg++) {
            var languageItem = makeActionMenuItem(MENU_LANGUAGE_TITLES[lg], 'selectMenuLanguage:');
            languageItem.tag = lg;
            menuLanguageMenuItems.push(languageItem);
            languageMenu.addItem(languageItem);
        }
        var languageRootItem = $.NSMenuItem.alloc.init;
        languageRootItem.title = $.NSString.stringWithString(T('menuLanguageSubmenu'));
        languageRootItem.submenu = languageMenu;
        fileMenu.addItem(languageRootItem);
        addRootMenu(mainMenu, T('fileMenu'), fileMenu);

        var targetMenu = makeMenu(T('pedalboardMenu'));
        targetModeMenuItem = makeActionMenuItem(T('activateAfterStart'), 'toggleTargetMode:');
        targetMenu.addItem(targetModeMenuItem);
        targetMenu.addItem($.NSMenuItem.separatorItem);

        targetKnownMenuItems = [];
        for (var i = 0; i < KNOWN_TARGETS.length; i++) {
            var knownItem = makeActionMenuItem(KNOWN_TARGETS[i], 'selectKnownTarget:');
            knownItem.tag = i;
            targetKnownMenuItems.push(knownItem);
            targetMenu.addItem(knownItem);
        }
        targetMenu.addItem($.NSMenuItem.separatorItem);
        targetMenu.addItem(makeActionMenuItem(T('chooseAnotherApp'), 'chooseTargetApplication:'));
        targetCurrentMenuItem = makeActionMenuItem(T('selectedPrefix') + targetAppName, null);
        targetCurrentMenuItem.enabled = false;
        targetMenu.addItem(targetCurrentMenuItem);
        addRootMenu(mainMenu, T('pedalboardMenu'), targetMenu);

        var textMenu = makeMenu(T('lyricsMenu'));
        positionMenuItems = [];
        for (var p = 0; p < POSITION_VALUES.length; p++) {
            var positionItem = makeActionMenuItem(POSITION_TITLES[menuLanguage][p], 'selectLyricsPosition:');
            positionItem.tag = p;
            positionMenuItems.push(positionItem);
            textMenu.addItem(positionItem);
        }
        addRootMenu(mainMenu, T('lyricsMenu'), textMenu);

        var viewModeMenu = makeMenu(T('playerViewMenu'));
        quickTimeViewModeMenuItems = [];
        for (var v = 0; v < QUICKTIME_VIEW_MODE_VALUES.length; v++) {
            var viewModeItem = makeActionMenuItem(QUICKTIME_VIEW_MODE_TITLES[menuLanguage][v], 'selectQuickTimeViewMode:');
            viewModeItem.tag = v;
            quickTimeViewModeMenuItems.push(viewModeItem);
            viewModeMenu.addItem(viewModeItem);
        }
        addRootMenu(mainMenu, T('playerViewMenu'), viewModeMenu);

        var hotkeyMenu = makeMenu(T('hotkeysMenu'));
        hotkeyMenuItems = [];
        for (var h = 0; h < ACTION_DEFINITIONS.length; h++) {
            var hotkeyItem = makeActionMenuItem('', 'changeHotkey:');
            hotkeyItem.tag = h;
            hotkeyMenuItems.push(hotkeyItem);
            hotkeyMenu.addItem(hotkeyItem);
        }
        hotkeyMenu.addItem($.NSMenuItem.separatorItem);
        hotkeyMenu.addItem(makeActionMenuItem(T('restoreDefaultHotkeys'), 'resetHotkeys:'));
        addRootMenu(mainMenu, T('hotkeysMenu'), hotkeyMenu);

        updateSettingsMenuStates();
        settingsMenusInstalled = true;
    } catch (error) {
        settingsMenuController = null;
        menuLanguageMenuItems = [];
        targetModeMenuItem = null;
        targetCurrentMenuItem = null;
        targetKnownMenuItems = [];
        positionMenuItems = [];
        quickTimeViewModeMenuItems = [];
        hotkeyMenuItems = [];
        return;
    }

    // Built separately so that a problem here can never disable the menus above.
    try {
        var batchMenu = makeMenu(T('batchMenu'));

        batchMenu.addItem(makeActionMenuItem(T('chooseFiles'), 'chooseBatchFiles:'));
        batchFilesInfoItem = makeActionMenuItem(T('filesSelectedPrefix') + '0', null);
        batchMenu.addItem(batchFilesInfoItem);
        batchMenu.addItem($.NSMenuItem.separatorItem);

        batchMenu.addItem(makeActionMenuItem(T('chooseFont'), 'chooseBatchFontMenu:'));
        batchFontInfoItem = makeActionMenuItem(T('fontPrefix') + '—', null);
        batchMenu.addItem(batchFontInfoItem);
        batchMenu.addItem($.NSMenuItem.separatorItem);

        batchMenu.addItem(makeActionMenuItem(T('chooseSaveFolder'), 'chooseBatchFolder:'));
        batchFolderInfoItem = makeActionMenuItem(T('folderPrefix') + T('folderNotSelected'), null);
        batchMenu.addItem(batchFolderInfoItem);
        batchMenu.addItem($.NSMenuItem.separatorItem);

        var formatMenu = makeMenu(T('saveFormat'));
        batchFormatMenuItems = [];
        for (var f = 0; f < BATCH_FORMAT_TITLES.length; f++) {
            var formatItem = makeActionMenuItem(BATCH_FORMAT_TITLES[f], 'selectBatchFormat:');
            formatItem.tag = f;
            batchFormatMenuItems.push(formatItem);
            formatMenu.addItem(formatItem);
        }
        var formatRootItem = $.NSMenuItem.alloc.init;
        formatRootItem.title = $.NSString.stringWithString(T('saveFormat'));
        formatRootItem.submenu = formatMenu;
        batchMenu.addItem(formatRootItem);
        batchMenu.addItem($.NSMenuItem.separatorItem);

        batchVerseColorItem = makeActionMenuItem(T('verseColorPrefix') + batchVerseColorHex + ')', 'chooseBatchColorMenu:');
        batchVerseColorItem.tag = 0;
        batchMenu.addItem(batchVerseColorItem);

        batchChorusColorItem = makeActionMenuItem(T('chorusColorPrefix') + batchChorusColorHex + ')', 'chooseBatchColorMenu:');
        batchChorusColorItem.tag = 1;
        batchMenu.addItem(batchChorusColorItem);

        batchBridgeColorItem = makeActionMenuItem(T('bridgeColorPrefix') + batchBridgeColorHex + ')', 'chooseBatchColorMenu:');
        batchBridgeColorItem.tag = 2;
        batchMenu.addItem(batchBridgeColorItem);

        batchMenu.addItem($.NSMenuItem.separatorItem);
        batchMenu.addItem(makeActionMenuItem(T('startFormatting'), 'startBatchFormattingMenu:'));

        // Переименование именами не пересекается с форматированием, но живёт
        // в том же меню: это соседние шаги подготовки репертуара.
        batchMenu.addItem($.NSMenuItem.separatorItem);
        batchMenu.addItem(makeActionMenuItem(T('matchLyricsNames'), 'matchLyricsNamesMenu:'));
        batchMenu.addItem(makeActionMenuItem(T('resetSorting'), 'resetManualSortingMenu:'));
        batchMenu.addItem(makeActionMenuItem(T('removeStartingThe'), 'removeStartingTheMenu:'));

        addRootMenu(mainMenu, T('batchMenu'), batchMenu);
        updateBatchMenuStates();
    } catch (error) {
        batchFilesInfoItem = null;
        batchFontInfoItem = null;
        batchFolderInfoItem = null;
        batchFormatMenuItems = [];
        batchVerseColorItem = null;
        batchChorusColorItem = null;
        batchBridgeColorItem = null;
    }
}

function makeMenu(title) {
    var menu = $.NSMenu.alloc.initWithTitle($.NSString.stringWithString(title));
    menu.autoenablesItems = false;
    return menu;
}

function makeActionMenuItem(title, selectorName) {
    if (selectorName === null) {
        var plainItem = $.NSMenuItem.alloc.init;
        plainItem.title = $.NSString.stringWithString(title);
        plainItem.enabled = false;
        return plainItem;
    }
    var selector = $.NSSelectorFromString(selectorName);
    var item = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(
        $.NSString.stringWithString(title), selector, $.NSString.stringWithString('')
    );
    item.target = settingsMenuController;
    item.enabled = true;
    return item;
}

function addRootMenu(mainMenu, title, submenu) {
    var rootItem = $.NSMenuItem.alloc.init;
    rootItem.title = $.NSString.stringWithString(title);
    rootItem.submenu = submenu;
    mainMenu.addItem(rootItem);
    installedRootMenuItems.push(rootItem);
}

function updateSettingsMenuStates() {
    try {
        for (var lg = 0; lg < menuLanguageMenuItems.length; lg++) {
            menuLanguageMenuItems[lg].state = menuLanguage === MENU_LANGUAGE_VALUES[lg] ? 1 : 0;
        }
        if (targetModeMenuItem !== null) targetModeMenuItem.state = targetModeEnabled ? 1 : 0;
        for (var i = 0; i < targetKnownMenuItems.length; i++) {
            targetKnownMenuItems[i].state = targetAppPath === '' && targetAppName === KNOWN_TARGETS[i] ? 1 : 0;
        }
        if (targetCurrentMenuItem !== null) {
            targetCurrentMenuItem.title = $.NSString.stringWithString(T('selectedPrefix') + (targetAppName === '' ? T('none') : targetAppName));
        }
        for (var p = 0; p < positionMenuItems.length; p++) {
            positionMenuItems[p].state = lyricsPosition === POSITION_VALUES[p] ? 1 : 0;
        }
        for (var v = 0; v < quickTimeViewModeMenuItems.length; v++) {
            quickTimeViewModeMenuItems[v].state = quickTimeViewMode === QUICKTIME_VIEW_MODE_VALUES[v] ? 1 : 0;
        }
        for (var h = 0; h < hotkeyMenuItems.length; h++) {
            var definition = ACTION_DEFINITIONS[h];
            hotkeyMenuItems[h].title = $.NSString.stringWithString(actionTitle(definition) + ':  ' + hotkeys[definition.id]);
        }
    } catch (ignored) {}
}

function toggleTargetMode() {
    targetModeEnabled = !targetModeEnabled;
    savePreferences();
    updateSettingsMenuStates();

    if (targetModeEnabled && currentAudioPath !== null) {
        scheduleTargetActivation();
    } else {
        cancelTargetActivation();
    }
}

function selectKnownTarget(index) {
    if (index < 0 || index >= KNOWN_TARGETS.length) return;
    targetAppPath = '';
    targetAppName = KNOWN_TARGETS[index];
    targetModeEnabled = true;
    savePreferences();
    updateSettingsMenuStates();
    if (currentAudioPath !== null) scheduleTargetActivation();
}

function chooseTargetApplication() {
    if (fileChooserIsOpen) return;
    fileChooserIsOpen = true;
    pauseGlobalKeyMonitorForFilePanel();
    try {
        app.activate();
        var selected = app.chooseFile({
            withPrompt: T('chooseAppPrompt'),
            ofType: ['com.apple.application-bundle']
        });
        var selectedPath = normalizePath(String(selected));
        if (extensionOf(fileName(selectedPath)).toLowerCase() !== 'app') {
            showError(T('errNeedAppBundle'));
            return;
        }
        targetAppPath = selectedPath;
        targetAppName = baseName(fileName(selectedPath));
        targetModeEnabled = true;
        savePreferences();
        updateSettingsMenuStates();
        if (currentAudioPath !== null) scheduleTargetActivation();
    } catch (error) {
        // The user cancelled the application chooser.
    } finally {
        fileChooserIsOpen = false;
        resumeGlobalKeyMonitorAfterFilePanel();
    }
}

function selectLyricsPosition(index) {
    if (index < 0 || index >= POSITION_VALUES.length) return;
    lyricsPosition = POSITION_VALUES[index];
    savePreferences();
    updateSettingsMenuStates();
    arrangeCurrentViewerWindow();
    // Зона QuickTime зеркальна зоне текста — при смене стороны текста она
    // сама пересчитывается внутри quickTimeWindowBounds().
    arrangeQuickTimeWindow();
    scheduleQuickTimeStripSettle();
}

function selectQuickTimeViewMode(index) {
    if (index < 0 || index >= QUICKTIME_VIEW_MODE_VALUES.length) return;
    quickTimeViewMode = QUICKTIME_VIEW_MODE_VALUES[index];
    savePreferences();
    updateSettingsMenuStates();
    arrangeQuickTimeWindow();
    scheduleQuickTimeStripSettle();
}

// Каждый пункт меню и его заголовок собираются один раз, при первой
// установке меню (installSettingsMenus), — простого updateSettingsMenuStates()
// недостаточно для смены ЯЗЫКА (обновляет только СОСТОЯНИЕ уже
// существующих пунктов и несколько заранее динамических title, а не текст
// заголовков, заданных один раз при создании). Поэтому смена языка
// удаляет все ранее добавленные корневые пункты меню (см.
// installedRootMenuItems в addRootMenu) и запускает установку заново —
// это пересоздаёт все меню и их пункты уже с текстом на новом языке.
function selectMenuLanguage(index) {
    if (index < 0 || index >= MENU_LANGUAGE_VALUES.length) return;
    menuLanguage = MENU_LANGUAGE_VALUES[index];
    savePreferences();
    rebuildSettingsMenus();
}

function rebuildSettingsMenus() {
    try {
        var mainMenu = $.NSApplication.sharedApplication.mainMenu;
        if (mainMenu !== null && mainMenu !== undefined) {
            for (var i = 0; i < installedRootMenuItems.length; i++) {
                try { mainMenu.removeItem(installedRootMenuItems[i]); } catch (ignored) {}
            }
        }
    } catch (ignored) {}
    installedRootMenuItems = [];
    settingsMenusInstalled = false;
    installSettingsMenus();
}

function changeHotkey(actionIndex) {
    if (actionIndex < 0 || actionIndex >= ACTION_DEFINITIONS.length) return;
    var definition = ACTION_DEFINITIONS[actionIndex];
    var labels = [];
    for (var i = 0; i < HOTKEY_CHOICES.length; i++) labels.push(HOTKEY_CHOICES[i].label);

    var selected = app.chooseFromList(labels, {
        withPrompt: T('chooseKeyPromptPrefix') + actionTitle(definition) + T('chooseKeyPromptSuffix'),
        defaultItems: [hotkeys[definition.id]],
        okButtonName: T('assignButton'),
        cancelButtonName: T('cancelButton'),
        multipleSelectionsAllowed: false,
        emptySelectionAllowed: false
    });
    if (selected === false || selected === null || selected.length === 0) return;

    var selectedLabel = String(selected[0]);
    for (var a = 0; a < ACTION_DEFINITIONS.length; a++) {
        var other = ACTION_DEFINITIONS[a];
        if (other.id !== definition.id && hotkeys[other.id] === selectedLabel) {
            showError(T('keyTakenPrefix') + selectedLabel + T('keyTakenMiddle') + actionTitle(other) + T('keyTakenSuffix'));
            return;
        }
    }
    hotkeys[definition.id] = selectedLabel;
    savePreferences();
    updateSettingsMenuStates();
}

function resetHotkeys() {
    try {
        // Подпись кнопки и сравнение берутся из одной и той же строки —
        // иначе после смены языка сравнение перестало бы совпадать.
        var restoreLabel = T('restoreButton');
        var cancelLabel = T('cancelButton');
        var result = app.displayDialog(T('restoreHotkeysQuestion'), {
            withTitle: 'PressNext Live', buttons: [cancelLabel, restoreLabel], defaultButton: restoreLabel, cancelButton: cancelLabel
        });
        if (String(result.buttonReturned) !== restoreLabel) return;
    } catch (error) {
        return;
    }
    hotkeys = defaultHotkeys();
    savePreferences();
    updateSettingsMenuStates();
}

function defaultHotkeys() {
    var result = {};
    for (var i = 0; i < ACTION_DEFINITIONS.length; i++) result[ACTION_DEFINITIONS[i].id] = ACTION_DEFINITIONS[i].defaultKey;
    return result;
}

function hotkeysAreUnique(candidate) {
    var seen = {};
    for (var i = 0; i < ACTION_DEFINITIONS.length; i++) {
        var label = candidate[ACTION_DEFINITIONS[i].id];
        if (seen[label]) return false;
        seen[label] = true;
    }
    return true;
}

function createHotkeyChoices() {
    var choices = [
        {label: '←', keyCode: 123, modifiers: 0}, {label: '→', keyCode: 124, modifiers: 0},
        {label: '↑', keyCode: 126, modifiers: 0}, {label: '↓', keyCode: 125, modifiers: 0},
        {label: 'Space', keyCode: 49, modifiers: 0}, {label: 'Esc', keyCode: 53, modifiers: 0},
        {label: 'Return', keyCode: 36, modifiers: 0}, {label: 'Tab', keyCode: 48, modifiers: 0},
        {label: 'Page Up', keyCode: 116, modifiers: 0}, {label: 'Page Down', keyCode: 121, modifiers: 0},
        {label: 'Home', keyCode: 115, modifiers: 0}, {label: 'End', keyCode: 119, modifiers: 0},
        {label: 'Cmd+O', keyCode: 31, modifiers: MODIFIER_COMMAND}, {label: 'Cmd+Q', keyCode: 12, modifiers: MODIFIER_COMMAND},
        {label: 'Cmd+←', keyCode: 123, modifiers: MODIFIER_COMMAND}, {label: 'Cmd+→', keyCode: 124, modifiers: MODIFIER_COMMAND},
        {label: 'Cmd+↑', keyCode: 126, modifiers: MODIFIER_COMMAND}, {label: 'Cmd+↓', keyCode: 125, modifiers: MODIFIER_COMMAND}
    ];
    var functionKeyCodes = [122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111];
    for (var f = 0; f < functionKeyCodes.length; f++) choices.push({label: 'F' + (f + 1), keyCode: functionKeyCodes[f], modifiers: 0});

    var letterCodes = {A:0,B:11,C:8,D:2,E:14,F:3,G:5,H:4,I:34,J:38,K:40,L:37,M:46,N:45,O:31,P:35,Q:12,R:15,S:1,T:17,U:32,V:9,W:13,X:7,Y:16,Z:6};
    for (var letter in letterCodes) {
        if (!letterCodes.hasOwnProperty(letter)) continue;
        choices.push({label: letter, keyCode: letterCodes[letter], modifiers: 0});
        choices.push({label: 'Cmd+' + letter, keyCode: letterCodes[letter], modifiers: MODIFIER_COMMAND});
    }
    return choices;
}

function hotkeyChoiceForLabel(label) {
    for (var i = 0; i < HOTKEY_CHOICES.length; i++) {
        if (HOTKEY_CHOICES[i].label === String(label)) return HOTKEY_CHOICES[i];
    }
    return null;
}

function accessibilityIsAllowed() {
    try {
        return Boolean($.AXIsProcessTrusted());
    } catch (error) {
        return false;
    }
}

function requestKeyboardPermissionIfNeeded() {
    if (accessibilityIsAllowed()) return;

    try {
        var promptKey = $.NSString.stringWithString('AXTrustedCheckOptionPrompt');
        var yes = $.NSNumber.numberWithBool(true);
        var options = $.NSDictionary.dictionaryWithObjectForKey(yes, promptKey);
        $.AXIsProcessTrustedWithOptions(options);
    } catch (error) {
        try {
            app.doShellScript('/usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"');
        } catch (ignored) {}
    }

    if (!permissionMessageShown) {
        permissionMessageShown = true;
        app.activate();
        app.displayDialog(
            T('permissionMessage'),
            {withTitle: T('permissionTitle'), buttons: [T('permissionButton')], defaultButton: T('permissionButton')}
        );
    }
}

function installKeyboardMonitorsWhenAllowed() {
    // Skip re-installation while a native chooseFile/chooseFolder panel is
    // open; that window pauses the global monitor on its own (see
    // pauseGlobalKeyMonitorForFilePanel) and this idle-driven call must not
    // race with that and reinstall it underneath the panel.
    if (fileChooserIsOpen || !accessibilityIsAllowed()) return;
    installGlobalKeyMonitor();
    installLocalKeyMonitor();
}

function installGlobalKeyMonitor() {
    if (globalKeyMonitor !== null) return;
    var keyDownMask = 1 << 10;
    globalKeyMonitor = $.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler(
        keyDownMask,
        function(event) {
            recordKey(event);
        }
    );
}

function installLocalKeyMonitor() {
    if (localKeyMonitor !== null) return;
    var keyDownMask = 1 << 10;
    localKeyMonitor = $.NSEvent.addLocalMonitorForEventsMatchingMaskHandler(
        keyDownMask,
        function(event) {
            return recordKey(event) ? null : event;
        }
    );
}

// Native chooseFile/chooseFolder panels (song search, target-app picker,
// batch-formatter file/folder pickers, renaming pickers) run their own modal
// loop. Both key monitors keep firing while that loop is running: the global
// one sees every keystroke on the system, and the LOCAL one sees every
// keystroke aimed at this app's own windows - which includes the panel
// itself, since the panel belongs to PressNext Live. Re-entering the
// JXA/AppleScript runtime from either callback while the main thread is
// already blocked inside a native modal panel has been observed to crash
// PressNext Live on macOS Tahoe: first when switching the keyboard input
// source while typing in the panel's search field, and later on a plain
// Cmd+A (select all) inside the panel.
//
// Earlier versions paused only the global monitor and deliberately left the
// local one installed so that Cmd+Q would still work over the panel. That
// turned out to be exactly the remaining crash path, so BOTH monitors are now
// paused for the duration of the panel. The cost is small: while a panel is
// open the assigned keys do nothing, and the panel is closed with its own
// Cancel button or Esc, as any macOS dialog.
function pauseGlobalKeyMonitorForFilePanel() {
    if (globalKeyMonitor !== null) {
        try { $.NSEvent.removeMonitor(globalKeyMonitor); } catch (ignored) {}
        globalKeyMonitor = null;
    }
    if (localKeyMonitor !== null) {
        try { $.NSEvent.removeMonitor(localKeyMonitor); } catch (ignored) {}
        localKeyMonitor = null;
    }
}

function resumeGlobalKeyMonitorAfterFilePanel() {
    // Точно то же условие и тот же порядок, что и в штатной установке
    // мониторов (installKeyboardMonitorsWhenAllowed), чтобы после панели
    // приложение возвращалось ровно в то состояние, в котором было.
    if (!accessibilityIsAllowed()) return;
    installGlobalKeyMonitor();
    installLocalKeyMonitor();
}

function recordKey(event) {
    try {
        if (Boolean(event.isARepeat)) return false;
        if (!keyboardContextIsAllowed()) return false;

        var keyCode = Number(event.keyCode);
        var modifiers = Number(event.modifierFlags) & RELEVANT_MODIFIER_MASK;
        var actionID = actionForHotkeyEvent(keyCode, modifiers);
        if (actionID === null) return false;

        // Leave the system chooser's own keyboard handling intact, except for
        // the explicitly assigned quit action.
        if (fileChooserIsOpen && actionID !== 'quit') return false;

        if (actionID === 'quit') {
            pendingCommand = 4;
            return true;
        }
        if (actionID === 'open') {
            pendingCommand = 6;
            try { app.activate(); } catch (ignored) {}
            return true;
        }
        if (actionID === 'seekBack') {
            pendingSeekSeconds -= 10;
            pendingSeekDeadline = Date.now() + 220;
            return true;
        }
        if (actionID === 'seekForward') {
            pendingSeekSeconds += 10;
            pendingSeekDeadline = Date.now() + 220;
            return true;
        }
        if (actionID === 'previousTrack') {
            pendingCommand = -1;
            return true;
        }
        if (actionID === 'nextTrack') {
            pendingCommand = 1;
            return true;
        }
        if (actionID === 'stop') {
            pendingCommand = 3;
            return true;
        }
        if (actionID === 'pause') {
            pendingCommand = 5;
            return true;
        }
        if (actionID === 'volumeDown') {
            pendingVolumeDeltaDB -= QUICKTIME_VOLUME_STEP_DB;
            pendingVolumeDeadline = Date.now() + 220;
            return true;
        }
        if (actionID === 'volumeUp') {
            pendingVolumeDeltaDB += QUICKTIME_VOLUME_STEP_DB;
            pendingVolumeDeadline = Date.now() + 220;
            return true;
        }
    } catch (error) {}

    return false;
}

function actionForHotkeyEvent(keyCode, modifiers) {
    for (var i = 0; i < ACTION_DEFINITIONS.length; i++) {
        var definition = ACTION_DEFINITIONS[i];
        var choice = hotkeyChoiceForLabel(hotkeys[definition.id]);
        if (choice !== null && choice.keyCode === keyCode && choice.modifiers === modifiers) return definition.id;
    }
    return null;
}

function keyboardContextIsAllowed() {
    try {
        var frontmost = $.NSWorkspace.sharedWorkspace.frontmostApplication;
        var bundleID = ObjC.unwrap(frontmost.bundleIdentifier);
        var applicationName = ObjC.unwrap(frontmost.localizedName);
        return bundleID === 'com.apple.Preview' ||
               bundleID === 'com.apple.TextEdit' ||
               bundleID === 'com.apple.QuickTimePlayerX' ||
               bundleID === 'local.pressnextlive' ||
               (targetModeEnabled && runningApplicationMatchesTarget(frontmost));
    } catch (error) {
        return false;
    }
}

function namesMatchTarget(applicationName) {
    try {
        var actual = String(applicationName).toLowerCase();
        var wanted = String(targetAppName).toLowerCase();
        return actual === wanted || actual.indexOf(wanted + ' ') === 0;
    } catch (error) {
        return false;
    }
}

function runningApplicationMatchesTarget(runningApplication) {
    try {
        if (targetAppPath !== '') {
            var runningPath = ObjC.unwrap(runningApplication.bundleURL.path);
            return normalizePath(String(runningPath)) === normalizePath(targetAppPath);
        }
        var applicationName = ObjC.unwrap(runningApplication.localizedName);
        return namesMatchTarget(applicationName);
    } catch (error) {
        return false;
    }
}

function findRunningTargetApplication() {
    try {
        var runningApplications = $.NSWorkspace.sharedWorkspace.runningApplications;
        var count = Number(runningApplications.count);

        for (var i = 0; i < count; i++) {
            var runningApplication = runningApplications.objectAtIndex(i);
            if (runningApplicationMatchesTarget(runningApplication)) return runningApplication;
        }
    } catch (error) {}

    return null;
}

function targetApplicationIsFrontmost() {
    try {
        var frontmost = $.NSWorkspace.sharedWorkspace.frontmostApplication;
        return runningApplicationMatchesTarget(frontmost);
    } catch (error) {
        return false;
    }
}

function activateTargetApplication() {
    if (!targetModeEnabled || (targetAppPath === '' && targetAppName === '')) return false;

    var runningTarget = findRunningTargetApplication();
    var activationRequested = false;

    if (runningTarget !== null) {
        try {
            var applicationPath = ObjC.unwrap(runningTarget.bundleURL.path);
            if (applicationPath) {
                app.doShellScript('/usr/bin/open ' + shellQuote(String(applicationPath)));
                activationRequested = true;
            }
        } catch (ignored) {}

        try {
            activationRequested = Boolean(runningTarget.activateWithOptions(3)) || activationRequested;
        } catch (ignored) {}

        if (activationRequested) return true;
    }

    if (targetAppPath !== '') {
        try {
            app.doShellScript('/usr/bin/open ' + shellQuote(targetAppPath));
            return true;
        } catch (ignored) {}
    }

    try {
        app.doShellScript('/usr/bin/open -a ' + shellQuote(targetAppName));
        return true;
    } catch (ignored) {}

    return false;
}

function chooseStartingSong() {
    if (fileChooserIsOpen) return;

    fileChooserIsOpen = true;
    pauseGlobalKeyMonitorForFilePanel();
    try {
        app.activate();
        var selected = app.chooseFile({
            withPrompt: T('chooseSongPrompt'),
            ofType: ['public.mp3', 'com.microsoft.waveform-audio']
        });
        loadPlaylist(String(selected));
    } catch (error) {
        // The user cancelled the chooser.
    } finally {
        fileChooserIsOpen = false;
        resumeGlobalKeyMonitorAfterFilePanel();
    }
}

function reopenSongChooser() {
    if (fileChooserIsOpen) return;

    if (!closeCurrentDocuments(true)) {
        showError(T('errCloseBeforeChooser'));
        return;
    }

    chooseStartingSong();
}

function loadPlaylist(selectedPath) {
    selectedPath = normalizePath(selectedPath);
    if (!isSupportedAudio(selectedPath)) {
        showError(T('errNotAudioFile'));
        return;
    }

    var folder = directoryName(selectedPath);
    var names = namesInFolder(folder);
    if (names === null) {
        showError(T('errFolderUnreadable'));
        return;
    }

    folderNames = names;
    playlist = [];

    for (var i = 0; i < names.length; i++) {
        if (isSupportedAudio(names[i])) {
            playlist.push(joinPath(folder, names[i]));
        }
    }

    playlist.sort(function(a, b) {
        return fileName(a).toLowerCase().localeCompare(fileName(b).toLowerCase(), undefined, {numeric: true});
    });

    if (playlist.length === 0) {
        showError(T('errNoAudioInFolder'));
        return;
    }

    currentIndex = 0;
    for (var p = 0; p < playlist.length; p++) {
        if (normalizePath(playlist[p]) === selectedPath) {
            currentIndex = p;
            break;
        }
    }

    playCurrentTrack();
}

function namesInFolder(folder) {
    try {
        var errorRef = Ref();
        var result = $.NSFileManager.defaultManager.contentsOfDirectoryAtPathError($(folder), errorRef);
        if (!result) return null;

        var names = [];
        var count = Number(result.count);
        for (var i = 0; i < count; i++) {
            names.push(String(ObjC.unwrap(result.objectAtIndex(i))));
        }
        return names;
    } catch (error) {
        return null;
    }
}

function previousTrack() {
    if (playlist.length === 0) {
        chooseStartingSong();
        return;
    }
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playCurrentTrack();
}

function nextTrack() {
    if (playlist.length === 0) {
        chooseStartingSong();
        return;
    }
    currentIndex = (currentIndex + 1) % playlist.length;
    playCurrentTrack();
}

function quitPlayer() {
    pendingSeekSeconds = 0;
    pendingSeekDeadline = 0;
    pendingVolumeDeltaDB = 0;
    pendingVolumeDeadline = 0;
    cancelBatchFormatting();
    cancelTargetActivation();
    cancelQuickTimeStripSettle();
    if (!closeCurrentDocuments(true)) {
        showError(T('errCloseConfirmQuit'));
        return;
    }

    try {
        if (globalKeyMonitor !== null) $.NSEvent.removeMonitor(globalKeyMonitor);
        if (localKeyMonitor !== null) $.NSEvent.removeMonitor(localKeyMonitor);
    } catch (ignored) {}

    globalKeyMonitor = null;
    localKeyMonitor = null;
    $.NSApplication.sharedApplication.terminate(null);
}

function seekBy(seconds) {
    if (currentAudioPath === null) return;

    var amount = Number(seconds);
    var source = appleScriptTargetPrelude(currentAudioPath, currentAudioDocumentID) +
        'if application "QuickTime Player" is not running then return "missing"\n' +
        'tell application "QuickTime Player"\n' +
        '  repeat with d in documents\n' +
        appleScriptDocumentMatch('    ') +
        '    if isTarget then\n' +
        '      try\n' +
        '        set newTime to (current time of d) + (' + amount + ')\n' +
        '        if newTime < 0 then set newTime to 0\n' +
        '        set totalTime to duration of d\n' +
        '        if totalTime > 0 and newTime > totalTime then set newTime to totalTime\n' +
        '        set current time of d to newTime\n' +
        '        return "ok"\n' +
        '      on error\n' +
        '        return "error"\n' +
        '      end try\n' +
        '    end if\n' +
        '  end repeat\n' +
        'end tell\n' +
        'return "missing"';

    var result = runAppleScript(source);
    if (result === 'missing') closeCurrentDocuments(true);
}

// Громкость — линейная величина у QuickTime, а дБ — логарифмическая
// шкала, поэтому шаг переводится в множитель: 10^(дБ/20). Множитель
// накапливается уже в JS (см. pendingVolumeDeltaDB) — сюда попадает уже
// готовая суммарная дБ-дельта одного вызова.
function adjustQuickTimeVolume(deltaDB) {
    if (currentAudioPath === null) return;

    var rawMultiplier = Math.pow(10, Number(deltaDB) / 20);
    var multiplier = Math.round(rawMultiplier * 1000000) / 1000000;
    var source = appleScriptTargetPrelude(currentAudioPath, currentAudioDocumentID) +
        'if application "QuickTime Player" is not running then return "missing"\n' +
        'tell application "QuickTime Player"\n' +
        '  repeat with d in documents\n' +
        appleScriptDocumentMatch('    ') +
        '    if isTarget then\n' +
        '      try\n' +
        '        set newVolume to (audio volume of d) * ' + multiplier + '\n' +
        '        if newVolume < ' + QUICKTIME_VOLUME_MIN + ' then set newVolume to ' + QUICKTIME_VOLUME_MIN + '\n' +
        '        if newVolume > ' + QUICKTIME_VOLUME_MAX + ' then set newVolume to ' + QUICKTIME_VOLUME_MAX + '\n' +
        '        set audio volume of d to newVolume\n' +
        '        return "ok"\n' +
        '      on error\n' +
        '        return "error"\n' +
        '      end try\n' +
        '    end if\n' +
        '  end repeat\n' +
        'end tell\n' +
        'return "missing"';

    var result = runAppleScript(source);
    if (result === 'missing') closeCurrentDocuments(true);
}

function togglePause() {
    if (currentAudioPath === null) return;

    var source = appleScriptTargetPrelude(currentAudioPath, currentAudioDocumentID) +
        'if application "QuickTime Player" is not running then return "missing"\n' +
        'tell application "QuickTime Player"\n' +
        '  repeat with d in documents\n' +
        appleScriptDocumentMatch('    ') +
        '    if isTarget then\n' +
        '      try\n' +
        '        if playing of d then\n' +
        '          pause d\n' +
        '          return "paused"\n' +
        '        else\n' +
        '          play d\n' +
        '          return "playing"\n' +
        '        end if\n' +
        '      on error\n' +
        '        return "error"\n' +
        '      end try\n' +
        '    end if\n' +
        '  end repeat\n' +
        'end tell\n' +
        'return "missing"';

    var result = runAppleScript(source);
    if (result === 'paused') paused = true;
    if (result === 'playing') paused = false;
    if (result === 'missing') closeCurrentDocuments(true);
}

function playCurrentTrack() {
    if (busy || currentIndex < 0 || currentIndex >= playlist.length) return;
    busy = true;

    var audioPath = playlist[currentIndex];
    var companionPath = matchingCompanion(audioPath);

    // During a track change, close and verify the old documents but keep the
    // applications alive. Quitting and immediately reopening them caused a race.
    if (!closeCurrentDocuments(false)) {
        busy = false;
        showError(T('errClosePrevious'));
        return;
    }

    currentAudioPath = audioPath;
    currentCompanionPath = companionPath;
    currentAudioDocumentID = null;
    currentCompanionDocumentID = null;
    currentViewerAppName = null;
    currentViewerBundleID = null;
    paused = false;

    var audioSource =
        'set audioFile to POSIX file "' + appleScriptEscape(audioPath) + '"\n' +
        'tell application "QuickTime Player"\n' +
        '  activate\n' +
        '  set openedDocument to open audioFile\n' +
        '  play openedDocument\n' +
        '  try\n' +
        '    return "id:" & ((id of openedDocument) as text)\n' +
        '  on error\n' +
        '    return "opened"\n' +
        '  end try\n' +
        'end tell';

    var audioResult = runAppleScript(audioSource);
    if (audioResult === null) {
        var audioCleanedUp = closeCurrentDocuments(false);
        busy = false;
        if (audioCleanedUp) {
            showError(T('errOpenSongClosed'));
        } else {
            showError(T('errOpenSongUnconfirmed'));
        }
        return;
    }
    currentAudioDocumentID = documentIDFromResult(audioResult);
    // Сразу, до открытия текста: окно плеера получает свою половину экрана
    // ещё до того, как его успеешь заметить посреди экрана.
    arrangeQuickTimeWindow();
    // QuickTime может сам перестроить своё окно через долю секунды после
    // открытия (например, когда становится известна длительность трека).
    // Короткая серия повторных попыток в первые ~1.5 секунды перекрывает
    // этот момент; после неё, до конца песни, окна больше не трогаются.
    scheduleQuickTimeStripSettle();

    if (companionPath !== null) {
        var viewer = viewerForCompanion(companionPath);
        currentViewerAppName = viewer.appName;
        currentViewerBundleID = viewer.bundleID;
        var companionResult = openCompanion(companionPath, viewer);
        if (companionResult === null) {
            var companionCleanedUp = closeCurrentDocuments(false);
            busy = false;
            if (companionCleanedUp) {
                showError(T('errLyricsClosed'));
            } else {
                showError(T('errLyricsUnconfirmed'));
            }
            return;
        }
        currentCompanionDocumentID = documentIDFromResult(companionResult);
        arrangeCurrentViewerWindow();
        // Зона текста и зона QuickTime — разные половины экрана, поэтому
        // окна не перекрываются; этот вызов — просто дополнительная
        // подстраховка на случай, если открытие окна текста как-то задело
        // экран. Серия попыток выше уже запущена. До конца песни, дальше
        // этого момента, окна больше не трогаются: фокус и MIDI остаются
        // у DAW.
        arrangeQuickTimeWindow();
    }

    // Without a companion viewer, keep this controller frontmost so the same arrow is not
    // also interpreted by QuickTime Player as a native keyboard command.
    if (companionPath === null) {
        try { app.activate(); } catch (ignored) {}
    }

    // Opening above is synchronous: start an immediate, verified activation
    // sequence without delaying playback or keyboard handling.
    scheduleTargetActivation();
    busy = false;
}

function matchingCompanion(audioPath) {
    var targetBase = baseName(fileName(audioPath)).toLowerCase();
    var folder = directoryName(audioPath);
    var priority = ['png', 'jpg', 'jpeg', 'pdf', 'docx', 'txt'];

    for (var p = 0; p < priority.length; p++) {
        for (var i = 0; i < folderNames.length; i++) {
            var candidate = folderNames[i];
            var candidateExtension = extensionOf(candidate).toLowerCase();
            if (candidateExtension === priority[p] && baseName(candidate).toLowerCase() === targetBase) {
                return joinPath(folder, candidate);
            }
        }
    }

    return null;
}

function viewerForCompanion(path) {
    var extension = extensionOf(fileName(path)).toLowerCase();
    if (extension === 'txt' || extension === 'docx') {
        return {appName: 'TextEdit', bundleID: 'com.apple.TextEdit'};
    }
    return {appName: 'Preview', bundleID: 'com.apple.Preview'};
}

function openCompanion(path, viewer) {
    var source =
        'set companionFile to POSIX file "' + appleScriptEscape(path) + '"\n' +
        'delay 0.15\n' +
        'tell application "' + appleScriptEscape(viewer.appName) + '"\n' +
        '  set openedDocument to open companionFile\n' +
        '  activate\n' +
        '  try\n' +
        '    return "id:" & ((id of openedDocument) as text)\n' +
        '  on error\n' +
        '    return "opened"\n' +
        '  end try\n' +
        'end tell';
    return runAppleScript(source);
}

// Определяет фактическое положение окна текста: 'second' при отсутствии
// физического второго монитора трактуется как 'left' (с однократным
// предупреждением). Вынесено отдельно, чтобы окно QuickTime могло
// зеркально повторить именно ФАКТИЧЕСКУЮ, а не запрошенную сторону.
function resolvedLyricsPosition() {
    if (lyricsPosition !== 'second') return lyricsPosition;
    try {
        var screens = $.NSScreen.screens;
        if (Number(screens.count) > 1) return 'second';
    } catch (error) {}
    if (!secondMonitorWarningShown) {
        secondMonitorWarningShown = true;
        showError(T('errNoSecondDisplay'));
    }
    return 'left';
}

// Прямоугольник зоны экрана для одного из положений:
// 'left' / 'right' — половина основного экрана; 'second' — второй монитор
// целиком (вызывающий код обязан заранее исключить 'second' без реального
// второго монитора через resolvedLyricsPosition); 'full' — основной экран
// целиком, без деления пополам.
function screenZoneBounds(position) {
    try {
        var screens = $.NSScreen.screens;
        var count = Number(screens.count);
        if (count < 1) return null;

        var primaryFrame = screens.objectAtIndex(0).frame;
        var selectedScreen = (position === 'second' && count > 1) ?
            screens.objectAtIndex(1) : screens.objectAtIndex(0);

        var visible = selectedScreen.visibleFrame;
        var x = Math.round(Number(visible.origin.x));
        var y = Math.round(Number(primaryFrame.size.height) - Number(visible.origin.y) - Number(visible.size.height));
        var width = Math.max(320, Math.round(Number(visible.size.width)));
        var height = Math.max(240, Math.round(Number(visible.size.height)));

        if (position === 'left' || position === 'right') {
            var leftWidth = Math.floor(width / 2);
            var rightWidth = width - leftWidth;
            if (position === 'left') {
                width = leftWidth;
            } else {
                x += leftWidth;
                width = rightWidth;
            }
        }
        // 'full' и 'second' (на реальном втором экране) — без деления,
        // x/width уже равны границам всего visibleFrame выбранного экрана.

        return {x: x, y: y, width: width, height: height};
    } catch (error) {
        return null;
    }
}

function lyricsWindowBounds() {
    return screenZoneBounds(resolvedLyricsPosition());
}

// Зона QuickTime — половина, ПРОТИВОПОЛОЖНАЯ фактическому положению текста:
// 'left' текста → 'right' для QuickTime, и наоборот. Если текст занимает
// весь второй монитор, QuickTime получает целиком основной экран — там,
// где обычно и находится DAW.
function quickTimeWindowZonePosition() {
    var resolved = resolvedLyricsPosition();
    if (resolved === 'left') return 'right';
    if (resolved === 'right') return 'left';
    return 'full';
}

function quickTimeWindowBounds() {
    return screenZoneBounds(quickTimeWindowZonePosition());
}

// Ищет переднее окно первого процесса с данным bundle identifier —
// НАПРЯМУЮ через нативный мост JXA (Application('System Events')),
// в процессе самого PressNext Live, а не через отдельный процесс
// osascript. Раньше окна размещались через runAppleScript(), которая
// делает `do shell script "osascript -e '...'"` — а это ЗАПУСКАЕТ ОТДЕЛЬНЫЙ
// ПРОЦЕСС /usr/bin/osascript, которому для управления System Events нужно
// СВОЁ, отдельное разрешение Universal Access — не то, что выдано
// PressNext Live. osascript не .app-бандл, поэтому это разрешение не
// появляется в списке «Универсальный доступ» обычным образом, и его
// включение/выключение для PressNext Live ни на что не влияет. Прямой
// вызов через $-мост / Application() отправляет Apple Event из процесса
// самого PressNext Live, которому разрешение уже выдано.
//
// Возвращает {window: <окно или null>, diagnostic: <строка>}.
function findFrontWindowOfProcess(bundleID, maxAttempts) {
    var systemEvents = Application('System Events');
    var lastMatchedCount = 0;

    for (var attempt = 0; attempt < maxAttempts; attempt++) {
        var processes;
        try {
            processes = systemEvents.applicationProcesses();
        } catch (error) {
            return {window: null, diagnostic: 'processes-failed:' + errorText(error)};
        }

        var matchedCount = 0;
        for (var i = 0; i < processes.length; i++) {
            var proc = processes[i];
            var procBundleID;
            try {
                procBundleID = proc.bundleIdentifier();
            } catch (ignored) {
                continue;
            }
            if (procBundleID !== bundleID) continue;
            matchedCount += 1;

            var windows;
            try {
                windows = proc.windows();
            } catch (error) {
                return {window: null, diagnostic: 'windows-failed:' + errorText(error)};
            }
            if (windows.length > 0) {
                return {window: windows[0], diagnostic: 'found'};
            }
        }

        lastMatchedCount = matchedCount;
        if (attempt < maxAttempts - 1) delay(0.05);
    }

    if (lastMatchedCount === 0) return {window: null, diagnostic: 'no-process'};
    return {window: null, diagnostic: 'no-windows:' + lastMatchedCount};
}

function errorText(error) {
    try {
        if (error && error.message) return String(error.message);
        return String(error);
    } catch (ignored) {
        return 'unknown-error';
    }
}

function arrangeCurrentViewerWindow() {
    if (currentViewerBundleID === null) return;
    var bounds = lyricsWindowBounds();
    if (bounds === null) return;

    try {
        var found = findFrontWindowOfProcess(currentViewerBundleID, 10);
        if (found.window === null) return;
        try {
            found.window.position = [bounds.x, bounds.y];
            found.window.size = [bounds.width, bounds.height];
        } catch (ignored) {}
    } catch (ignored) {}
}

// ---------------------------------------------------------------------
// Окно QuickTime
// ---------------------------------------------------------------------
// Окно плеера получает СВОЮ отдельную половину экрана — ту, что
// противоположна окну текста (см. quickTimeWindowBounds выше). Ширина
// растягивается на всю зону; высота остаётся естественной, той, что
// запросит сам QuickTime. По вертикали — в зависимости от quickTimeViewMode
// (меню «Плеер: вид»):
//   'full' — окно целиком видно, прижато к нижнему краю зоны;
//   'half' — вниз за экран уезжает ровно половина высоты окна: видна
//            только верхняя половина (заголовок + бегунок с таймингом),
//            нижняя (кнопки перемотки, громкость) прячется за краем.
// Поскольку зона QuickTime и зона текста — это две разные, не
// пересекающиеся половины экрана, окна никогда не перекрывают друг друга.
//
// Как и arrangeCurrentViewerWindow, размещение идёт напрямую через
// нативный мост JXA (см. комментарий у findFrontWindowOfProcess) — без
// дочернего процесса osascript и без отдельного разрешения Universal
// Access для него.
//
// Результат — не просто "успех/провал", а подробная диагностическая
// строка, на случай будущих проблем (см. errorText).
function arrangeQuickTimeWindow() {
    if (currentAudioPath === null) return null;

    var zone = quickTimeWindowBounds();
    if (zone === null) return null;
    var zoneBottom = zone.y + zone.height;

    var previousApplication = frontmostApplicationSnapshot();
    var result;

    try {
        var found = findFrontWindowOfProcess(QUICKTIME_BUNDLE_ID, 20);
        if (found.window === null) {
            result = found.diagnostic;
        } else {
            var songWindow = found.window;
            var naturalHeight;
            try {
                naturalHeight = songWindow.size()[1];
            } catch (error) {
                naturalHeight = null;
                result = 'get-size-failed:' + errorText(error);
            }

            if (naturalHeight !== null) {
                try {
                    songWindow.size = [zone.width, naturalHeight];
                } catch (ignored) {
                    // Лучшая попытка: если сама ширина не применилась, всё
                    // равно продолжаем с тем, что реально получилось.
                }

                var windowHeight;
                try {
                    windowHeight = songWindow.size()[1];
                } catch (error) {
                    windowHeight = null;
                    result = 'get-size2-failed:' + errorText(error);
                }

                if (windowHeight !== null) {
                    // 'half': вниз за экран уезжает половина высоты окна —
                    // остаётся видна верхняя половина (заголовок + бегунок
                    // с таймингом). 'full': видна вся высота окна.
                    var visibleHeight = quickTimeViewMode === 'half' ? Math.round(windowHeight / 2) : windowHeight;
                    try {
                        songWindow.position = [zone.x, zoneBottom - visibleHeight];
                        result = 'positioned:' + windowHeight;
                    } catch (error) {
                        result = 'set-position-failed:' + errorText(error);
                    }

                    try {
                        songWindow.actions.byName('AXRaise').perform();
                    } catch (ignored) {}
                }
            }
        }
    } catch (error) {
        result = 'exception:' + errorText(error);
    }

    restoreFocusIfQuickTimeStoleIt(previousApplication);
    return result;
}

// Планирует короткую серию повторных попыток (см. QUICKTIME_STRIP_SETTLE_*)
// сразу после того, как песня открылась. Нужна на случай, если сам
// QuickTime подвинет или растянет своё окно через долю секунды после
// открытия — например, когда становится известна длительность файла.
// После заданного числа попыток (около 1.5 секунд) серия останавливается
// сама и до конца песни окна больше не трогаются ни разу.
function scheduleQuickTimeStripSettle() {
    quickTimeStripSettleAttempts = 0;
    quickTimeStripSettleDeadline = Date.now() + QUICKTIME_STRIP_SETTLE_RETRY_INTERVAL_MS;
}

function cancelQuickTimeStripSettle() {
    quickTimeStripSettleDeadline = 0;
    quickTimeStripSettleAttempts = 0;
}

function processQuickTimeStripSettle() {
    if (currentAudioPath === null) {
        cancelQuickTimeStripSettle();
        return;
    }

    quickTimeStripSettleAttempts += 1;
    arrangeQuickTimeWindow();

    if (quickTimeStripSettleAttempts < QUICKTIME_STRIP_SETTLE_RETRY_COUNT) {
        quickTimeStripSettleDeadline = Date.now() + QUICKTIME_STRIP_SETTLE_RETRY_INTERVAL_MS;
    } else {
        cancelQuickTimeStripSettle();
    }
}

function frontmostApplicationSnapshot() {
    try {
        var frontmost = $.NSWorkspace.sharedWorkspace.frontmostApplication;
        if (frontmost === null || frontmost === undefined) return null;
        return {
            application: frontmost,
            bundleID: String(ObjC.unwrap(frontmost.bundleIdentifier))
        };
    } catch (error) {
        return null;
    }
}

// AXRaise обычно не переключает фокус, но если macOS всё же вывела вперёд
// QuickTime, активное приложение возвращается на место. Если фокус ушёл
// куда-то ещё, значит его переключил сам пользователь — не мешаем.
function restoreFocusIfQuickTimeStoleIt(previousApplication) {
    try {
        if (previousApplication === null) return;
        if (previousApplication.bundleID === QUICKTIME_BUNDLE_ID) return;

        var currentBundleID = '';
        var frontmost = $.NSWorkspace.sharedWorkspace.frontmostApplication;
        if (frontmost !== null && frontmost !== undefined) {
            currentBundleID = String(ObjC.unwrap(frontmost.bundleIdentifier));
        }
        if (currentBundleID !== QUICKTIME_BUNDLE_ID) return;

        if (targetModeEnabled && currentAudioPath !== null) {
            scheduleTargetActivation();
            return;
        }
        previousApplication.application.activateWithOptions(3);
    } catch (ignored) {}
}

function checkForEndOfTrack() {
    if (busy || currentAudioPath === null) return;

    var source = appleScriptTargetPrelude(currentAudioPath, currentAudioDocumentID) +
        'if application "QuickTime Player" is not running then return "missing"\n' +
        'tell application "QuickTime Player"\n' +
        '  repeat with d in documents\n' +
        appleScriptDocumentMatch('    ') +
        '    if isTarget then\n' +
        '      try\n' +
        '        set totalTime to duration of d\n' +
        '        set playTime to current time of d\n' +
        '        if totalTime > 0 and playTime >= (totalTime - 0.25) then return "ended"\n' +
        '        return "playing"\n' +
        '      on error\n' +
        '        return "playing"\n' +
        '      end try\n' +
        '    end if\n' +
        '  end repeat\n' +
        'end tell\n' +
        'return "missing"';

    var state = runAppleScript(source);
    if ((state === 'ended' && !paused) || state === 'missing') {
        closeCurrentDocuments(true);
    }
}

function closeCurrentDocuments(quitApps) {
    cancelTargetActivation();
    cancelQuickTimeStripSettle();
    if (currentAudioPath === null) return true;

    var hasCompanion = currentCompanionPath !== null && currentViewerAppName !== null;
    var viewerAppName = currentViewerAppName;

    var source = appleScriptTargetPrelude(currentAudioPath, currentAudioDocumentID) +
        'repeat 20 times\n' +
        '  set foundAudio to false\n' +
        '  if application "QuickTime Player" is running then\n' +
        '    tell application "QuickTime Player"\n' +
        '      repeat with d in documents\n' +
        appleScriptDocumentMatch('        ') +
        '        if isTarget then\n' +
        '          set foundAudio to true\n' +
        '          try\n' +
        '            stop d\n' +
        '            close d\n' +
        '          end try\n' +
        '          exit repeat\n' +
        '        end if\n' +
        '      end repeat\n' +
        '    end tell\n' +
        '  end if\n' +
        '  if foundAudio is false then exit repeat\n' +
        '  delay 0.05\n' +
        'end repeat\n' +
        'if foundAudio then return "audio_not_closed"';

    if (hasCompanion) {
        var viewerCloseCommand = viewerAppName === 'TextEdit' ? 'close d saving no' : 'close d';
        source +=
            '\n' + appleScriptTargetPrelude(currentCompanionPath, currentCompanionDocumentID) +
            'repeat 20 times\n' +
            '  set foundCompanion to false\n' +
            '  if application "' + appleScriptEscape(viewerAppName) + '" is running then\n' +
            '    tell application "' + appleScriptEscape(viewerAppName) + '"\n' +
            '      repeat with d in documents\n' +
            appleScriptDocumentMatch('        ') +
            '        if isTarget then\n' +
            '          set foundCompanion to true\n' +
            '          try\n' +
            '            ' + viewerCloseCommand + '\n' +
            '          end try\n' +
            '          exit repeat\n' +
            '        end if\n' +
            '      end repeat\n' +
            '    end tell\n' +
            '  end if\n' +
            '  if foundCompanion is false then exit repeat\n' +
            '  delay 0.05\n' +
            'end repeat\n' +
            'if foundCompanion then return "companion_not_closed"';
    }

    if (quitApps) {
        source +=
            '\nset waitForQuickTime to false\n' +
            'set waitForViewer to false\n' +
            'if application "QuickTime Player" is running then\n' +
            '  tell application "QuickTime Player"\n' +
            '    if (count of documents) is 0 then\n' +
            '      set waitForQuickTime to true\n' +
            '      quit\n' +
            '    end if\n' +
            '  end tell\n' +
            'end if\n' +
            (hasCompanion ?
                'if application "' + appleScriptEscape(viewerAppName) + '" is running then\n' +
                '  tell application "' + appleScriptEscape(viewerAppName) + '"\n' +
                '    if (count of documents) is 0 then\n' +
                '      set waitForViewer to true\n' +
                '      quit\n' +
                '    end if\n' +
                '  end tell\n' +
                'end if\n' : '') +
            'repeat 40 times\n' +
            '  set quickTimeDone to true\n' +
            '  set viewerDone to true\n' +
            '  if waitForQuickTime then\n' +
            '    if application "QuickTime Player" is running then set quickTimeDone to false\n' +
            '  end if\n' +
            (hasCompanion ?
                '  if waitForViewer then\n' +
                '    if application "' + appleScriptEscape(viewerAppName) + '" is running then set viewerDone to false\n' +
                '  end if\n' : '') +
            '  if quickTimeDone and viewerDone then exit repeat\n' +
            '  delay 0.05\n' +
            'end repeat';
    }

    source += '\nreturn "closed"';
    var closeResult = runAppleScript(source);
    if (closeResult !== 'closed') return false;

    currentAudioPath = null;
    currentCompanionPath = null;
    currentAudioDocumentID = null;
    currentCompanionDocumentID = null;
    currentViewerAppName = null;
    currentViewerBundleID = null;
    paused = false;
    try { app.activate(); } catch (ignored) {}
    return true;
}

function runAppleScript(source) {
    try {
        return String(app.doShellScript('/usr/bin/osascript -e ' + shellQuote(source))).trim();
    } catch (error) {
        return null;
    }
}

function showError(message) {
    try {
        app.activate();
        app.displayDialog(message, {
            withTitle: 'PressNext Live',
            buttons: ['OK'],
            defaultButton: 'OK',
            withIcon: 'caution'
        });
    } catch (ignored) {}
}

function normalizePath(path) {
    path = String(path);
    if (path.indexOf('file://') === 0) {
        try { path = decodeURIComponent(path.substring(7)); } catch (ignored) {}
    }
    return path;
}

function directoryName(path) {
    var position = path.lastIndexOf('/');
    if (position <= 0) return '/';
    return path.substring(0, position);
}

function fileName(path) {
    var position = path.lastIndexOf('/');
    return position < 0 ? path : path.substring(position + 1);
}

function extensionOf(name) {
    var position = name.lastIndexOf('.');
    return position < 0 ? '' : name.substring(position + 1);
}

function baseName(name) {
    var position = name.lastIndexOf('.');
    return position < 0 ? name : name.substring(0, position);
}

function isSupportedAudio(path) {
    var extension = extensionOf(fileName(path)).toLowerCase();
    return extension === 'mp3' || extension === 'wav';
}

function joinPath(folder, name) {
    return folder === '/' ? '/' + name : folder + '/' + name;
}

function documentIDFromResult(result) {
    var match = /^id:(-?\d+)$/.exec(String(result));
    return match ? match[1] : null;
}

function documentIDLiteral(documentID) {
    return documentID !== null && /^-?\d+$/.test(String(documentID))
        ? String(documentID)
        : 'missing value';
}

function appleScriptTargetPrelude(path, documentID) {
    return (
        'set targetDocumentID to ' + documentIDLiteral(documentID) + '\n' +
        'set targetPOSIXPath to "' + appleScriptEscape(path) + '"\n' +
        'set targetDocumentName to "' + appleScriptEscape(fileName(path)) + '"\n' +
        'set targetFile to (POSIX file targetPOSIXPath) as alias\n'
    );
}

function appleScriptDocumentMatch(indent) {
    return (
        indent + 'set isTarget to false\n' +
        indent + 'try\n' +
        indent + '  if targetDocumentID is not missing value then\n' +
        indent + '    if (id of d) is targetDocumentID then set isTarget to true\n' +
        indent + '  end if\n' +
        indent + 'end try\n' +
        indent + 'if isTarget is false then\n' +
        indent + '  try\n' +
        indent + '    set documentFile to (file of d) as alias\n' +
        indent + '    if documentFile is targetFile then set isTarget to true\n' +
        indent + '  end try\n' +
        indent + 'end if\n' +
        indent + 'if isTarget is false then\n' +
        indent + '  try\n' +
        indent + '    if (POSIX path of ((file of d) as alias)) is targetPOSIXPath then set isTarget to true\n' +
        indent + '  end try\n' +
        indent + 'end if\n' +
        indent + 'if isTarget is false then\n' +
        indent + '  try\n' +
        indent + '    if (path of d as text) is targetPOSIXPath then set isTarget to true\n' +
        indent + '  end try\n' +
        indent + 'end if\n' +
        indent + 'if isTarget is false then\n' +
        indent + '  try\n' +
        indent + '    if (name of d) is targetDocumentName then set isTarget to true\n' +
        indent + '  end try\n' +
        indent + 'end if\n'
    );
}

function appleScriptEscape(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function shellQuote(text) {
    return "'" + String(text).replace(/'/g, "'\"'\"'") + "'";
}

// =====================================================================
// Пакетное форматирование текста (Batch Format Lyrics)
// =====================================================================
// Берёт текстовые файлы с текстами песен (TXT/DOCX/RTF), автоматически
// форматирует их под размер 1400x1960 (половина экрана), выделяет
// повторяющиеся припев/бридж, сжимает "неэкономные" короткие строки и
// повторяющиеся слова, затем рисует "скриншот" (PNG/JPG/PDF) размером
// не более ~300 КБ и сохраняет его в выбранную папку — с тем же именем,
// что и у исходного файла, чтобы PressNext Live мог сразу показывать его как
// сопроводительный файл песни.
//
// Распознавание припева/бриджа:
//  - Если в файле есть явные метки строф — [Chorus]/[Verse]/[Bridge] или
//    русские Припев/Куплет/Бридж (в скобках, с двоеточием или без) —
//    используются они. Это самый надёжный вариант.
//  - Если меток нет, форматтер сам ищет повторяющиеся блоки текста:
//    первый повторяющийся блок считается припевом, второй — бриджем.
//    Это эвристика и может ошибиться на нестандартной структуре песни —
//    в таком случае проще всего добавить в текстовый файл метки строф.
// =====================================================================

// ---- Section tags ----------------------------------------------------
// Метка строфы распознаётся не по одному жёсткому шаблону, а разбором
// строки: снимаются скобки, хвостовые повторы ((x2), 2 раза, х3),
// номер строфы, двоеточие. Поэтому одинаково понимаются [Chorus],
// (ПРИПЕВ 2), «Припев:», «Chorus x2», «Рефрен -» и «Припев: первая
// строка» (текст в той же строке, что и метка).

function normalizeTagCore(text) {
    return String(text).toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[^a-zа-я0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Returns {type, repeat, rest} or null.
//   type   — 'chorus' | 'bridge' | 'verse' | 'other'
//   repeat — число из хвоста метки ("Припев x2" -> 2), иначе 1
//   rest   — текст, стоящий в той же строке после двоеточия
function parseSectionTag(line) {
    var raw = String(line).trim();
    if (raw === '') return null;

    var head = raw;
    var rest = '';
    var colonIndex = raw.search(/[:\uFF1A]/);
    if (colonIndex >= 0 && colonIndex <= 32) {
        head = raw.slice(0, colonIndex);
        rest = raw.slice(colonIndex + 1).trim();
    } else if (raw.length > 40) {
        return null;
    }

    head = head.replace(/^[\[\(\{]\s*/, '').replace(/\s*[\]\)\}]\s*$/, '').trim();
    if (head === '') return null;

    // Строка вида «1.», «2)», «[3]» — нумерация куплетов: не метка раздела,
    // но и не текст песни, поэтому просто разделяет блоки.
    if (rest === '' && /^\d{1,2}\s*[\.\)]?$/.test(head)) return {type: 'other', repeat: 1, rest: ''};

    var repeat = 1;
    var repeatMatch = head.match(/[\(\[]?\s*(?:[xх]\s*(\d{1,2})|(\d{1,2})\s*[xх]|(\d{1,2})\s*раз[аы]?)\s*[\)\]]?\s*$/i);
    if (repeatMatch) {
        var parsed = parseInt(repeatMatch[1] || repeatMatch[2] || repeatMatch[3], 10);
        if (parsed > 1 && parsed <= 20) repeat = parsed;
        head = head.slice(0, repeatMatch.index);
    }

    var core = normalizeTagCore(head);
    core = core.replace(/\s*(?:n|№)?\s*\d+\s*$/, '').trim();
    if (core === '' || core.length > 24) return null;

    for (var i = 0; i < SECTION_KEYWORDS.length; i++) {
        var group = SECTION_KEYWORDS[i];
        for (var w = 0; w < group.words.length; w++) {
            if (core === group.words[w]) return {type: group.type, repeat: repeat, rest: rest};
        }
    }
    return null;
}

// ---- Splitting the file into stanzas ---------------------------------
// Блоки разделяются пустыми строками И строками-метками. Второе важно:
// в файлах без пустых строк (весь текст сплошняком) метки раньше не
// работали вообще, потому что проверялась только первая строка блока.

function splitIntoBlocks(rawText) {
    var normalized = String(rawText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var rawLines = normalized.split('\n');
    var blocks = [];
    var current = null;

    function flush() {
        if (current !== null && (current.lines.length > 0 || current.tag !== null)) blocks.push(current);
        current = null;
    }

    for (var i = 0; i < rawLines.length; i++) {
        var line = rawLines[i].replace(/[\s\u00a0]+$/, '');
        if (line.trim() === '') { flush(); continue; }

        var tag = parseSectionTag(line);
        if (tag !== null) {
            flush();
            if (tag.type === 'other') {
                // Интро/проигрыш/кода — просто разделитель: строка убирается,
                // но следующий блок НЕ помечается куплетом (иначе повтор
                // припева после «Проигрыша» переставал распознаваться).
                if (tag.rest !== '') current = {tag: null, lines: [tag.rest]};
                continue;
            }
            current = {tag: tag, lines: []};
            if (tag.rest !== '') current.lines.push(tag.rest);
            continue;
        }

        var text = line.trim();
        if (current === null) {
            current = {tag: null, lines: []};
            // «1. Я иду по улице» — нумерация куплета в начале строки. Её
            // нужно снять, иначе номер попадает в текст и мешает сравнению
            // повторов.
            var enumerated = text.match(/^\d{1,2}\s*[\.\)]\s+(\S.*)$/);
            if (enumerated) text = enumerated[1];
        }
        current.lines.push(text);
    }
    flush();
    return blocks;
}

function nextContentBlock(blocks, fromIndex) {
    for (var i = fromIndex + 1; i < blocks.length; i++) {
        if (blocks[i].lines.length > 0) return blocks[i];
    }
    return null;
}

// Одинокая строка «Припев» между куплетами означает одно из двух:
// либо это заголовок для следующего блока (первое появление), либо
// сокращение «здесь поётся припев» — очень частая запись в русских
// текстах. Раньше второй случай молча помечал припевом следующий
// куплет. Теперь: если текст этого раздела уже встречался и следующий
// блок не повторяет его дословно — это отметка о повторе.
function blocksToStanzas(blocks) {
    var stanzas = [];
    var seen = {chorus: [], bridge: []};

    for (var b = 0; b < blocks.length; b++) {
        var block = blocks[b];
        var tag = block.tag;

        if (block.lines.length === 0) {
            if (tag === null) continue;
            var follower = nextContentBlock(blocks, b);
            if (tag.type === 'chorus' || tag.type === 'bridge') {
                var known = seen[tag.type];
                var followerRepeatsIt = false;
                if (follower !== null && follower.tag === null && known.length > 0) {
                    var followerSig = stanzaSignature(follower.lines);
                    for (var k = 0; k < known.length; k++) {
                        if (signaturesMatch(followerSig, known[k])) { followerRepeatsIt = true; break; }
                    }
                }
                if (known.length > 0 && !followerRepeatsIt) {
                    stanzas.push({lines: [], explicitTag: tag.type, repeat: 1, repeatMarker: true, count: tag.repeat});
                    continue;
                }
            }
            if (follower !== null && follower.tag === null) {
                follower.tag = {type: tag.type, repeat: tag.repeat, rest: ''};
            }
            continue;
        }

        var type = tag === null ? null : tag.type;
        if (type === 'chorus' || type === 'bridge') seen[type].push(stanzaSignature(block.lines));
        stanzas.push({
            lines: block.lines.slice(),
            explicitTag: type,
            repeat: tag === null ? 1 : tag.repeat,
            repeatMarker: false,
            count: 1
        });
    }
    return stanzas;
}

// ---- Fallback: файл без пустых строк и без меток ---------------------
// Если строфы вообще ничем не разделены, ищем самый длинный блок строк,
// который повторяется в песне хотя бы дважды, и режем текст по нему.
// Это возвращает припев в файлах, где раньше вся песня была одной
// строфой и никакого припева найтись не могло в принципе.

function findRepeatedRun(keys, runLength) {
    var groups = {};
    for (var i = 0; i + runLength <= keys.length; i++) {
        var ok = true;
        var parts = [];
        for (var j = 0; j < runLength; j++) {
            if (keys[i + j] === '') { ok = false; break; }
            parts.push(keys[i + j]);
        }
        if (!ok) continue;
        var joined = parts.join('\n');
        if (joined.replace(/\s/g, '').length < AUTO_SECTION_MIN_CHARS) continue;
        if (!Object.prototype.hasOwnProperty.call(groups, joined)) groups[joined] = [];
        groups[joined].push(i);
    }

    var best = null;
    for (var key in groups) {
        if (!Object.prototype.hasOwnProperty.call(groups, key)) continue;
        var starts = groups[key];
        var kept = [];
        var lastEnd = -1;
        for (var s = 0; s < starts.length; s++) {
            if (starts[s] > lastEnd) { kept.push(starts[s]); lastEnd = starts[s] + runLength - 1; }
        }
        if (kept.length < 2) continue;
        if (best === null || kept.length > best.length || (kept.length === best.length && kept[0] < best[0])) best = kept;
    }
    return best;
}

function segmentByRepeatedRuns(lines) {
    var keys = [];
    for (var i = 0; i < lines.length; i++) keys.push(stanzaSignature([lines[i]]));

    var maxRun = Math.floor(lines.length / 2);
    for (var runLength = maxRun; runLength >= 2; runLength--) {
        var starts = findRepeatedRun(keys, runLength);
        if (starts === null) continue;

        var segments = [];
        var cursor = 0;
        for (var s = 0; s < starts.length; s++) {
            if (starts[s] > cursor) segments.push(lines.slice(cursor, starts[s]));
            segments.push(lines.slice(starts[s], starts[s] + runLength));
            cursor = starts[s] + runLength;
        }
        if (cursor < lines.length) segments.push(lines.slice(cursor));

        var stanzas = [];
        for (var g = 0; g < segments.length; g++) {
            if (segments[g].length === 0) continue;
            stanzas.push({lines: segments[g], explicitTag: null, repeat: 1, repeatMarker: false, count: 1});
        }
        if (stanzas.length >= 3) return stanzas;
    }
    return null;
}

function splitIntoStanzas(rawText) {
    var stanzas = blocksToStanzas(splitIntoBlocks(rawText));

    var totalLines = 0;
    var tagged = false;
    for (var i = 0; i < stanzas.length; i++) {
        if (stanzas[i].repeatMarker || stanzas[i].explicitTag !== null) tagged = true;
        totalLines += stanzas[i].lines.length;
    }
    if (!tagged && stanzas.length <= 2 && totalLines >= 6) {
        var flat = [];
        for (var i = 0; i < stanzas.length; i++) flat = flat.concat(stanzas[i].lines);
        var segmented = segmentByRepeatedRuns(flat);
        if (segmented !== null) return segmented;
    }
    return stanzas;
}

function stanzaSignature(lines) {
    var joined = String(lines.join(' ')).toLowerCase().replace(/ё/g, 'е');
    joined = joined.replace(/[\(\[]\s*(?:[xх]\s*\d{1,2}|\d{1,2}\s*[xх]|\d{1,2}\s*раз[аы]?)\s*[\)\]]/g, ' ');
    joined = joined.replace(/[^a-zа-я0-9\s]/g, ' ');
    joined = joined.replace(/\s+/g, ' ').trim();
    return joined;
}

// ---- Repeat / variation matching (chorus & bridge detection) ---------

function levenshteinDistance(a, b, limit) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;
    if (la > lb) {
        var tmpStr = a; a = b; b = tmpStr;
        var tmpLen = la; la = lb; lb = tmpLen;
    }
    var cap = (limit === undefined || limit === null) ? Infinity : limit;
    if (lb - la > cap) return cap + 1;

    var prevRow = new Array(la + 1);
    for (var i = 0; i <= la; i++) prevRow[i] = i;
    for (var j = 1; j <= lb; j++) {
        var currRow = new Array(la + 1);
        currRow[0] = j;
        var bChar = b.charAt(j - 1);
        var rowMin = currRow[0];
        for (var i = 1; i <= la; i++) {
            var cost = a.charAt(i - 1) === bChar ? 0 : 1;
            var deletion = prevRow[i] + 1;
            var insertion = currRow[i - 1] + 1;
            var substitution = prevRow[i - 1] + cost;
            currRow[i] = Math.min(deletion, insertion, substitution);
            if (currRow[i] < rowMin) rowMin = currRow[i];
        }
        if (rowMin > cap) return cap + 1;
        prevRow = currRow;
    }
    return prevRow[la];
}

// Допуск на «тот же самый припев, спетый чуть иначе» теперь зависит от
// длины строфы. Фиксированные 15 знаков вели к ошибкам в обе стороны:
// для короткой строфы (30 знаков) это половина текста — двe разные
// строфы слипались в одну; для длинной (250 знаков) одной изменённой
// строки хватало, чтобы повтор перестал опознаваться.
function allowedVariationDistance(a, b) {
    var minLen = Math.min(a.length, b.length);
    if (minLen === 0) return 0;
    var base = Math.max(MAX_VARIATION_DISTANCE, Math.floor(minLen * VARIATION_MIN_RATIO));
    var cap = Math.floor(minLen * VARIATION_MAX_RATIO);
    return Math.max(0, Math.min(base, cap));
}

// Расстояние между строфами, если они считаются одним разделом, иначе -1.
function signatureDistance(a, b) {
    var limit = allowedVariationDistance(a, b);
    if (Math.abs(a.length - b.length) > limit) return -1;
    var distance = levenshteinDistance(a, b, limit);
    return distance <= limit ? distance : -1;
}

function signaturesMatch(a, b) {
    return signatureDistance(a, b) >= 0;
}

function sectionLabel(type, kind) {
    var base = type === 'chorus' ? 'CHORUS' : 'BRIDGE';
    return (kind === 'var' ? '+VAR ' : '+') + base;
}

// ---- Classification --------------------------------------------------
// Разбор идёт в несколько проходов по всей песне, а не одним потоком
// сверху вниз. Это главное изменение: раньше строфа сравнивалась только
// с теми образцами, которые успели встретиться ВЫШЕ неё, поэтому
// непомеченный припев, стоящий до помеченного, оставался куплетом.

function attachToFamily(family, index, info) {
    family.members.push(index);
    info[index].family = family;
}

function findFamily(families, signature, type) {
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < families.length; i++) {
        if (type !== null && families[i].type !== type) continue;
        var distance = signatureDistance(signature, families[i].signature);
        if (distance < 0) continue;
        if (distance < bestDistance) { bestDistance = distance; best = families[i]; }
    }
    return best;
}

function classifyStanzas(stanzas) {
    var info = [];
    var hasChorusTag = false;
    var hasBridgeTag = false;

    for (var i = 0; i < stanzas.length; i++) {
        var st = stanzas[i];
        if (st.explicitTag === 'chorus') hasChorusTag = true;
        if (st.explicitTag === 'bridge') hasBridgeTag = true;
        info.push(st.repeatMarker ? null : {sig: stanzaSignature(st.lines), family: null, distance: 0});
    }

    var families = [];

    // Проход 1: семейства по явным меткам.
    for (var i = 0; i < stanzas.length; i++) {
        var st = stanzas[i];
        if (st.repeatMarker) continue;
        if (st.explicitTag !== 'chorus' && st.explicitTag !== 'bridge') continue;
        var family = findFamily(families, info[i].sig, st.explicitTag);
        if (family === null) {
            family = {type: st.explicitTag, signature: info[i].sig, members: [], tagged: true};
            families.push(family);
        }
        attachToFamily(family, i, info);
    }

    // Проход 2: любая непомеченная строфа, повторяющая помеченный
    // припев/бридж — где бы она ни стояла, выше или ниже метки.
    for (var i = 0; i < stanzas.length; i++) {
        var st = stanzas[i];
        if (st.repeatMarker || info[i].family !== null) continue;
        if (st.explicitTag === 'chorus' || st.explicitTag === 'bridge') continue;
        var match = findFamily(families, info[i].sig, null);
        if (match !== null) attachToFamily(match, i, info);
    }

    // Проход 3: недостающая роль ищется эвристикой по повторам.
    var autoRole = null;
    if (!hasChorusTag && hasBridgeTag) autoRole = 'chorus';
    else if (hasChorusTag && !hasBridgeTag) autoRole = 'bridge';
    else if (!hasChorusTag && !hasBridgeTag) autoRole = 'chorus';

    if (autoRole !== null) {
        var autoFamilies = [];
        for (var i = 0; i < stanzas.length; i++) {
            var st = stanzas[i];
            if (st.repeatMarker || info[i].family !== null) continue;
            if (st.explicitTag === 'verse') continue;
            if (info[i].sig.replace(/\s/g, '').length < AUTO_SECTION_MIN_CHARS) continue;
            var autoFamily = findFamily(autoFamilies, info[i].sig, autoRole);
            if (autoFamily === null) {
                autoFamily = {type: autoRole, signature: info[i].sig, members: [], tagged: false};
                autoFamilies.push(autoFamily);
            }
            attachToFamily(autoFamily, i, info);
        }
        for (var f = 0; f < autoFamilies.length; f++) {
            if (autoFamilies[f].members.length >= 2) {
                families.push(autoFamilies[f]);
            } else {
                for (var m = 0; m < autoFamilies[f].members.length; m++) info[autoFamilies[f].members[m]].family = null;
            }
        }
    }

    // Полным текстом показывается САМОЕ РАННЕЕ появление раздела, от него
    // же считается «точный повтор / повтор с отличиями».
    for (var f = 0; f < families.length; f++) {
        families[f].members.sort(function (x, y) { return x - y; });
        families[f].signature = info[families[f].members[0]].sig;
        for (var m = 0; m < families[f].members.length; m++) {
            var index = families[f].members[m];
            var distance = m === 0 ? 0 : signatureDistance(info[index].sig, families[f].signature);
            info[index].distance = distance < 0 ? 1 : distance;
        }
    }

    var results = [];
    for (var i = 0; i < stanzas.length; i++) {
        var st = stanzas[i];

        if (st.repeatMarker) {
            var target = null;
            for (var f = 0; f < families.length; f++) {
                if (families[f].type !== st.explicitTag) continue;
                if (families[f].members[0] > i) continue;
                if (target === null || families[f].members[0] > target.members[0]) target = families[f];
            }
            if (target === null) continue;
            results.push({stanza: st, type: st.explicitTag, isReference: false, kind: 'exact',
                          repeatMarker: true, count: st.count, repeat: 1, refEntry: target});
            continue;
        }

        var family = info[i].family;
        if (family === null) {
            results.push({stanza: st, type: 'verse', isReference: true, kind: null,
                          repeatMarker: false, count: 1, repeat: st.repeat, refEntry: null});
            continue;
        }
        var isReference = family.members[0] === i;
        results.push({
            stanza: st,
            type: family.type,
            isReference: isReference,
            kind: isReference ? null : (info[i].distance === 0 ? 'exact' : 'var'),
            repeatMarker: false,
            count: 1,
            repeat: st.repeat,
            refEntry: family
        });
    }

    return results;
}

function isVocaliseLine(line) {
    var cleaned = line.trim();
    if (cleaned === '') return false;
    var tokens = cleaned.split(/[\s\-]+/);
    var any = false;
    for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i].toLowerCase().replace(/[^a-zа-яё]/gi, '');
        if (t === '') continue;
        any = true;
        if (VOCALISE_SYLLABLES.indexOf(t) === -1) return false;
    }
    return any;
}

function replaceVocaliseRuns(lines) {
    var result = [];
    var i = 0;
    while (i < lines.length) {
        if (isVocaliseLine(lines[i])) {
            var j = i;
            while (j < lines.length && isVocaliseLine(lines[j])) j++;
            if (j - i >= 2) {
                result.push({text: 'VOCALISE', locked: true});
                i = j;
                continue;
            }
        }
        result.push({text: lines[i], locked: false});
        i++;
    }
    return result;
}

function isShortLine(text) {
    var words = text.trim().split(/\s+/).filter(function (w) { return w.length > 0; });
    if (words.length === 0) return false;
    return words.length <= SHORT_LINE_MAX_WORDS && text.trim().length <= SHORT_LINE_MAX_CHARS;
}

function groupShortLines(items) {
    var result = [];
    var i = 0;
    while (i < items.length) {
        var item = items[i];
        if (!item.locked && isShortLine(item.text)) {
            var j = i;
            var parts = [];
            while (j < items.length && !items[j].locked && isShortLine(items[j].text)) {
                parts.push(items[j].text.trim());
                j++;
            }
            if (parts.length >= 2) {
                result.push(parts.join('   '));
                i = j;
                continue;
            }
        }
        result.push(item.text);
        i++;
    }
    return result;
}

function normalizeWordCore(word) {
    return word.toLowerCase().replace(/^[^a-zа-яё0-9]+|[^a-zа-яё0-9]+$/gi, '');
}

function stripEdgePunctuation(word) {
    return word.replace(/^[^a-zа-яё0-9]+|[^a-zа-яё0-9]+$/gi, '');
}

function tokenizeWithSeparators(text) {
    var tokens = [];
    var regex = /(\s+)|(\S+)/g;
    var match;
    var pendingSep = '';
    var first = true;
    while ((match = regex.exec(text)) !== null) {
        if (match[1] !== undefined) {
            pendingSep = match[1].length >= 3 ? '   ' : ' ';
        } else {
            tokens.push({text: match[2], sep: first ? '' : pendingSep});
            first = false;
            pendingSep = ' ';
        }
    }
    return tokens;
}

function collapseRepeatedWords(lineText) {
    var tokens = tokenizeWithSeparators(lineText);
    var result = [];
    var i = 0;
    while (i < tokens.length) {
        var core = normalizeWordCore(tokens[i].text);
        var j = i;
        while (core !== '' && j + 1 < tokens.length && normalizeWordCore(tokens[j + 1].text) === core) j++;
        var count = j - i + 1;
        var displayWord = stripEdgePunctuation(tokens[i].text);
        var newText = count > 1 ? (displayWord + '*' + count) : tokens[i].text;
        result.push({sep: tokens[i].sep, text: newText});
        i = j + 1;
    }
    var out = '';
    for (var k = 0; k < result.length; k++) out += (k === 0 ? '' : result[k].sep) + result[k].text;
    return out;
}

function processStanzaLines(rawLines) {
    var afterVocalise = replaceVocaliseRuns(rawLines);
    var groupedLines = groupShortLines(afterVocalise);
    var finalLines = [];
    for (var i = 0; i < groupedLines.length; i++) finalLines.push(collapseRepeatedWords(groupedLines[i]));
    return finalLines;
}

// Returns an array of paragraphs:
// {type: 'verse'|'chorus'|'bridge', isPlaceholder: bool, colorKey: string|undefined, lines: [String]}
function formatLyrics(rawText) {
    var stanzas = splitIntoStanzas(rawText);
    var classified = classifyStanzas(stanzas);

    var paragraphs = [];
    for (var i = 0; i < classified.length; i++) {
        var r = classified[i];

        if (r.repeatMarker) {
            paragraphs.push({type: r.type, isPlaceholder: true, lines: [sectionLabel(r.type, r.kind)],
                             kind: r.kind, refEntry: r.refEntry, count: r.count});
            continue;
        }
        if (r.stanza.lines.length === 0) continue;

        if (r.isReference) {
            paragraphs.push({type: r.type, isPlaceholder: false, lines: processStanzaLines(r.stanza.lines)});
            // «Припев x2» у первого появления: сам текст плюс отметка об
            // остальных повторах.
            if (r.repeat > 1 && (r.type === 'chorus' || r.type === 'bridge')) {
                paragraphs.push({type: r.type, isPlaceholder: true, lines: [sectionLabel(r.type, null)],
                                 kind: null, refEntry: r.refEntry, count: r.repeat - 1});
            }
        } else {
            paragraphs.push({type: r.type, isPlaceholder: true, lines: [sectionLabel(r.type, r.kind)],
                             kind: r.kind, refEntry: r.refEntry, count: Math.max(1, r.repeat)});
        }
    }

    // No chorus or bridge anywhere in the song: cycle three colors across
    // every paragraph purely for readability, instead of leaving everything
    // in one flat verse color.
    var hasAnyChorusOrBridge = false;
    for (var i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].type === 'chorus' || paragraphs[i].type === 'bridge') { hasAnyChorusOrBridge = true; break; }
    }
    if (!hasAnyChorusOrBridge) {
        var cycle = ['verse', 'verseAlt1', 'verseAlt2'];
        for (var i = 0; i < paragraphs.length; i++) paragraphs[i].colorKey = cycle[i % 3];
    }

    var collapsed = [];
    for (var i = 0; i < paragraphs.length; i++) {
        var p = paragraphs[i];
        if (p.isPlaceholder) {
            // Only merge repeats of the SAME underlying reference text into
            // one "*N" count -- two different choruses/bridges happening to
            // land back-to-back must never be reported as one repeated more
            // than once.
            var count = p.count || 1;
            var j = i + 1;
            while (j < paragraphs.length && paragraphs[j].isPlaceholder &&
                   paragraphs[j].type === p.type && paragraphs[j].kind === p.kind &&
                   paragraphs[j].refEntry === p.refEntry) { count += (paragraphs[j].count || 1); j++; }
            var label = sectionLabel(p.type, p.kind) + (count > 1 ? ('*' + count) : '');
            collapsed.push({type: p.type, isPlaceholder: true, lines: [label], colorKey: p.colorKey});
            i = j - 1;
        } else {
            collapsed.push(p);
        }
    }

    return collapsed;
}

// ---- Font resolution ----

function isValidFont(f) {
    if (f === null || f === undefined) return false;
    try {
        var size = f.pointSize;
        if (size === null || size === undefined) return false;
        var name = f.fontName;
        return name !== null && name !== undefined && String(name) !== '';
    } catch (error) {
        return false;
    }
}

function fontExists(psName) {
    try {
        var f = $.NSFont.fontWithNameSize($.NSString.stringWithString(psName), 12);
        return isValidFont(f);
    } catch (error) {
        return false;
    }
}

function resolveBatchFontPSName() {
    if (batchFontName !== '' && fontExists(batchFontName)) return batchFontName;
    for (var i = 0; i < FALLBACK_FONT_CHAIN.length; i++) {
        if (fontExists(FALLBACK_FONT_CHAIN[i])) return FALLBACK_FONT_CHAIN[i];
    }
    return null;
}

function fontForSize(size, psName) {
    if (psName) {
        try {
            var f = $.NSFont.fontWithNameSize($.NSString.stringWithString(psName), size);
            if (isValidFont(f)) return f;
        } catch (ignored) {}
    }
    try {
        var bold = $.NSFont.boldSystemFontOfSize(size);
        if (isValidFont(bold)) return bold;
    } catch (ignored) {}
    try {
        var sys = $.NSFont.systemFontOfSize(size);
        if (isValidFont(sys)) return sys;
    } catch (ignored) {}
    try {
        var helv = $.NSFont.fontWithNameSize($.NSString.stringWithString('Helvetica'), size);
        if (isValidFont(helv)) return helv;
    } catch (ignored) {}
    try {
        var menlo = $.NSFont.fontWithNameSize($.NSString.stringWithString('Menlo-Bold'), size);
        if (isValidFont(menlo)) return menlo;
    } catch (ignored) {}
    return null;
}

// ---- Colors ----

function isValidColor(c) {
    if (c === null || c === undefined) return false;
    try {
        var a = c.alphaComponent;
        return a !== null && a !== undefined;
    } catch (error) {
        return false;
    }
}

function colorFromHex(hex) {
    var clean = String(hex).replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) clean = 'FFFFFF';
    var r = parseInt(clean.substring(0, 2), 16) / 255;
    var g = parseInt(clean.substring(2, 4), 16) / 255;
    var b = parseInt(clean.substring(4, 6), 16) / 255;
    try {
        var c = $.NSColor.colorWithSRGBRedGreenBlueAlpha(r, g, b, 1.0);
        if (isValidColor(c)) return c;
    } catch (ignored) {}
    try {
        var c2 = $.NSColor.colorWithCalibratedRedGreenBlueAlpha(r, g, b, 1.0);
        if (isValidColor(c2)) return c2;
    } catch (ignored) {}
    try {
        var c3 = $.NSColor.whiteColor;
        if (isValidColor(c3)) return c3;
    } catch (ignored) {}
    return null;
}

function componentToHex(value) {
    var clamped = Math.max(0, Math.min(255, Math.round(value)));
    var hex = clamped.toString(16).toUpperCase();
    return hex.length === 1 ? '0' + hex : hex;
}

function hexFromNSColor(color) {
    try {
        var converted = color.colorUsingColorSpace($.NSColorSpace.sRGBColorSpace);
        var r = Number(converted.redComponent) * 255;
        var g = Number(converted.greenComponent) * 255;
        var b = Number(converted.blueComponent) * 255;
        return componentToHex(r) + componentToHex(g) + componentToHex(b);
    } catch (error) {
        return 'FFFFFF';
    }
}

// ---- Text measurement & word-wrap ----

function measureWidth(text, font) {
    try {
        var nsstr = $.NSString.stringWithString(text);
        var fontKey = $.NSString.stringWithString('NSFont');
        var attrs = $.NSDictionary.dictionaryWithObjectForKey(font, fontKey);
        var size = nsstr.sizeWithAttributes(attrs);
        return Number(size.width);
    } catch (error) {
        var approxCharWidth = (Number(font.pointSize) || 24) * 0.55;
        return text.length * approxCharWidth;
    }
}

// Реальная высота строки текста у этого шрифта (то, что займёт
// drawAtPoint), а не оценка по кеглю. Нужна из-за узких полей: при
// поле в 8 px ошибка в пару пикселей уже срезает верх/низ букв.
function measureLineBoxHeight(font) {
    try {
        var nsstr = $.NSString.stringWithString('ЙĄgpQÉ');
        var fontKey = $.NSString.stringWithString('NSFont');
        var attrs = $.NSDictionary.dictionaryWithObjectForKey(font, fontKey);
        var height = Number(nsstr.sizeWithAttributes(attrs).height);
        if (height > 0) return height;
    } catch (error) {}
    return Number(font.pointSize) * 1.25;
}

// Одно слово длиннее строки (длинный распев, ссылка, склеенный текст)
// раньше выезжало за край картинки. Режем его по знакам.
function splitOversizedToken(text, font, maxWidth) {
    var pieces = [];
    var current = '';
    for (var i = 0; i < text.length; i++) {
        var candidate = current + text.charAt(i);
        if (current !== '' && measureWidth(candidate, font) > maxWidth) {
            pieces.push(current);
            current = text.charAt(i);
        } else {
            current = candidate;
        }
    }
    if (current !== '') pieces.push(current);
    return pieces.length === 0 ? [text] : pieces;
}

function wrapParagraphLine(text, font, maxWidth) {
    var tokens = tokenizeWithSeparators(text);
    if (tokens.length === 0) return [''];
    var wrapped = [];
    var currentText = '';
    var currentCount = 0;
    for (var i = 0; i < tokens.length; i++) {
        var tok = tokens[i];
        var candidateText = currentCount === 0 ? tok.text : currentText + tok.sep + tok.text;
        var width = measureWidth(candidateText, font);
        if (width <= maxWidth || (currentCount === 0 && measureWidth(tok.text, font) <= maxWidth)) {
            currentText = candidateText;
            currentCount++;
        } else if (currentCount === 0) {
            var chunks = splitOversizedToken(tok.text, font, maxWidth);
            for (var c = 0; c < chunks.length - 1; c++) wrapped.push(chunks[c]);
            currentText = chunks[chunks.length - 1];
            currentCount = 1;
        } else {
            wrapped.push(currentText);
            currentText = tok.text;
            currentCount = 1;
        }
    }
    if (currentCount > 0) wrapped.push(currentText);
    return wrapped;
}

// ---- Layout ----

function visualLineFullText(line) {
    var text = '';
    for (var i = 0; i < line.runs.length; i++) {
        var run = line.runs[i];
        text += (i === 0 ? '' : run.sepBefore) + run.text;
    }
    return text;
}

function buildLayout(paragraphs, font, maxWidth) {
    var lineHeight = Number(font.pointSize) * 1.18;
    var stanzaGap = Number(font.pointSize) * 0.55;
    var boxHeight = measureLineBoxHeight(font);
    var visualLines = [];
    var totalHeight = 0;

    for (var p = 0; p < paragraphs.length; p++) {
        var para = paragraphs[p];

        if (para.isPlaceholder && visualLines.length > 0) {
            var lastLine = visualLines[visualLines.length - 1];
            var candidateAppend = visualLineFullText(lastLine) + '   ' + para.lines[0];
            var candidateWidth = measureWidth(candidateAppend, font);
            if (candidateWidth <= maxWidth) {
                lastLine.runs.push({text: para.lines[0], colorType: para.colorKey || para.type, sepBefore: '   '});
                continue;
            }
        }

        var gapNeeded = visualLines.length > 0;
        var firstLineOfParagraph = true;

        for (var li = 0; li < para.lines.length; li++) {
            var wrapped = wrapParagraphLine(para.lines[li], font, maxWidth);
            for (var w = 0; w < wrapped.length; w++) {
                var gapBefore = firstLineOfParagraph && gapNeeded;
                visualLines.push({runs: [{text: wrapped[w], colorType: para.colorKey || para.type, sepBefore: ''}], gapBefore: gapBefore});
                totalHeight += lineHeight + (gapBefore ? stanzaGap : 0);
                firstLineOfParagraph = false;
            }
        }
    }

    // Последняя строка занимает не шаг строки, а полную высоту глифов:
    // без этой добавки при поле в 8 px у неё срезались бы хвосты букв.
    if (visualLines.length > 0) totalHeight += Math.max(0, boxHeight - lineHeight);

    return {visualLines: visualLines, totalHeight: totalHeight, lineHeight: lineHeight, stanzaGap: stanzaGap};
}

function findBestFontSize(paragraphs, maxWidth, maxHeight, minSize, maxSize, fontFactory) {
    var lo = minSize, hi = maxSize, best = minSize, bestLayout = null;
    for (var iter = 0; iter < 18 && lo <= hi; iter++) {
        var mid = Math.floor((lo + hi) / 2);
        var font = fontFactory(mid);
        var layout = buildLayout(paragraphs, font, maxWidth);
        if (layout.totalHeight <= maxHeight) {
            best = mid;
            bestLayout = layout;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    if (bestLayout === null) {
        bestLayout = buildLayout(paragraphs, fontFactory(minSize), maxWidth);
        best = minSize;
        return {size: best, layout: bestLayout};
    }

    // Целый кегль почти всегда оставляет неиспользованный остаток высоты.
    // Дотягиваем размер дробными шагами — иначе поля получаются больше
    // заявленных 8 px просто из-за округления.
    for (var extra = 0.75; extra > 0; extra -= 0.25) {
        if (best + extra > maxSize) continue;
        var refinedFont = fontFactory(best + extra);
        var refinedLayout = buildLayout(paragraphs, refinedFont, maxWidth);
        if (refinedLayout.totalHeight <= maxHeight) {
            best = best + extra;
            bestLayout = refinedLayout;
            break;
        }
    }
    return {size: best, layout: bestLayout};
}

// ---- Rendering ----

function buildAttrsDict(font, color) {
    var dict = $.NSMutableDictionary.alloc.init;
    var fontKey = $.NSString.stringWithString('NSFont');
    var colorKey = $.NSString.stringWithString('NSColor');
    dict.setObjectForKey(font, fontKey);
    dict.setObjectForKey(color, colorKey);
    return dict;
}

function drawVisualLine(line, font, colorForType, canvasWidth, y) {
    var safeFont = isValidFont(font) ? font : $.NSFont.systemFontOfSize(24);
    if (!isValidFont(safeFont)) {
        throw new Error('Не удалось получить рабочий шрифт для отрисовки (NSFont.systemFontOfSize тоже не сработал).');
    }
    var pieces = [];
    var totalWidth = 0;
    for (var i = 0; i < line.runs.length; i++) {
        var run = line.runs[i];
        var pieceText = (i === 0 ? '' : run.sepBefore) + run.text;
        var width = measureWidth(pieceText, safeFont);
        pieces.push({text: pieceText, width: width, colorType: run.colorType});
        totalWidth += width;
    }
    var x = (canvasWidth - totalWidth) / 2;
    for (var i = 0; i < pieces.length; i++) {
        var piece = pieces[i];
        var color = colorForType(piece.colorType);
        var safeColor = isValidColor(color) ? color : $.NSColor.whiteColor;
        if (!isValidColor(safeColor)) {
            throw new Error('Не удалось получить рабочий цвет для отрисовки (NSColor.whiteColor тоже не сработал).');
        }
        var attrs = buildAttrsDict(safeFont, safeColor);
        var nsstr = $.NSString.stringWithString(piece.text);
        nsstr.drawAtPointWithAttributes($.NSMakePoint(x, y), attrs);
        x += piece.width;
    }
}

function renderLyricsImage(paragraphs, verseColor, chorusColor, bridgeColor) {
    var maxWidth = CANVAS_WIDTH - 2 * MARGIN_X;
    var maxHeight = CANVAS_HEIGHT - 2 * MARGIN_Y;
    var psName = resolveBatchFontPSName();
    var fontFactory = function (size) { return fontForSize(size, psName); };

    var chosen = findBestFontSize(paragraphs, maxWidth, maxHeight, MIN_FONT_SIZE, MAX_FONT_SIZE, fontFactory);
    var font = fontFactory(chosen.size);
    var layout = chosen.layout;
    var overflow = layout.totalHeight > maxHeight;

    // Fixed readability colors -- only used when the whole song has no
    // chorus/bridge and formatLyrics cycles them across verse paragraphs.
    var verseAltColor1 = colorFromHex(VERSE_ALT_COLOR_1_HEX);
    var verseAltColor2 = colorFromHex(VERSE_ALT_COLOR_2_HEX);

    function colorForType(type) {
        if (type === 'chorus') return chorusColor;
        if (type === 'bridge') return bridgeColor;
        if (type === 'verseAlt1') return verseAltColor1;
        if (type === 'verseAlt2') return verseAltColor2;
        return verseColor;
    }

    var image = $.NSImage.alloc.initWithSize($.NSMakeSize(CANVAS_WIDTH, CANVAS_HEIGHT));
    image.lockFocusFlipped(true);
    try {
        $.NSColor.blackColor.set;
        $.NSBezierPath.fillRect($.NSMakeRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));

        // Остаток высоты (когда размер шрифта упёрся в ширину строки, а не
        // в высоту) раздаётся межстрочным интервалом, а не превращается в
        // пустые поля сверху и снизу. Прибавка ограничена, чтобы текст не
        // расползался на редкие строки.
        var lineCount = layout.visualLines.length;
        var slack = maxHeight - layout.totalHeight;
        var extraLeading = 0;
        if (slack > 0 && lineCount > 1) {
            extraLeading = Math.min(slack / (lineCount - 1), layout.lineHeight * MAX_EXTRA_LEADING_RATIO);
        }
        var usedHeight = layout.totalHeight + extraLeading * (lineCount - 1);

        var y = MARGIN_Y + Math.max(0, (maxHeight - usedHeight) / 2);
        for (var i = 0; i < layout.visualLines.length; i++) {
            var line = layout.visualLines[i];
            if (line.gapBefore) y += layout.stanzaGap;
            drawVisualLine(line, font, colorForType, CANVAS_WIDTH, y);
            y += layout.lineHeight + extraLeading;
        }
    } finally {
        image.unlockFocus;
    }

    var tiffData = image.TIFFRepresentation;
    if (tiffData === null || tiffData === undefined) {
        throw new Error('Не удалось получить TIFF-данные из нарисованного изображения (image.TIFFRepresentation вернул пусто).');
    }
    var bitmapRep = $.NSBitmapImageRep.alloc.initWithData(tiffData);
    if (bitmapRep === null || bitmapRep === undefined) {
        throw new Error('Не удалось создать NSBitmapImageRep из TIFF-данных.');
    }
    return {bitmapRep: bitmapRep, fontSize: chosen.size, overflow: overflow};
}

// ---- Export & compression ----

function representationData(bitmapRep, fileType, properties) {
    return bitmapRep.representationUsingTypeProperties(fileType, properties);
}

function compressJPEG(bitmapRep, maxBytes) {
    var qualities = [0.92, 0.85, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3, 0.22];
    var compressionKey = $.NSString.stringWithString('NSImageCompressionFactor');
    var lastData = null;
    var lastQuality = qualities[0];
    for (var i = 0; i < qualities.length; i++) {
        var q = qualities[i];
        var props = $.NSDictionary.dictionaryWithObjectForKey($.NSNumber.numberWithDouble(q), compressionKey);
        var data = representationData(bitmapRep, NS_BITMAP_FILETYPE_JPEG, props);
        lastData = data;
        lastQuality = q;
        if (data !== null && data !== undefined && Number(data.length) <= maxBytes) break;
    }
    return {data: lastData, quality: lastQuality};
}

function wrapImageInPDFData(image, pixelWidth, pixelHeight) {
    var frame = $.NSMakeRect(0, 0, pixelWidth, pixelHeight);
    var imageView = $.NSImageView.alloc.initWithFrame(frame);
    imageView.image = image;
    imageView.imageFrameStyle = 0;
    return imageView.dataWithPDFInsideRect(frame);
}

function exportRaster(bitmapRep, format, outputPath) {
    if (format === 'png') {
        var data = representationData(bitmapRep, NS_BITMAP_FILETYPE_PNG, $.NSDictionary.dictionary);
        writeDataToFile(data, outputPath);
        return {bytes: Number(data.length), quality: null};
    }
    if (format === 'jpg') {
        var result = compressJPEG(bitmapRep, TARGET_MAX_BYTES);
        writeDataToFile(result.data, outputPath);
        return {bytes: Number(result.data.length), quality: result.quality};
    }
    if (format === 'pdf') {
        var jpegResult = compressJPEG(bitmapRep, TARGET_MAX_BYTES);
        var compactImage = $.NSImage.alloc.initWithData(jpegResult.data);
        var pdfData = wrapImageInPDFData(compactImage, CANVAS_WIDTH, CANVAS_HEIGHT);
        writeDataToFile(pdfData, outputPath);
        return {bytes: Number(pdfData.length), quality: jpegResult.quality};
    }
    return null;
}

function writeDataToFile(data, path) {
    if (data === null || data === undefined) throw new Error(T('errNoData'));
    var ok = data.writeToFileAtomically($.NSString.stringWithString(path), true);
    if (!ok) throw new Error(T('errWriteFailed'));
}

// ---- Reading source lyrics files ----

function readLyricsText(path) {
    var extension = extensionOf(fileName(path)).toLowerCase();
    if (extension === 'txt') {
        var plain = readPlainTextFile(path);
        if (plain !== null) return plain;
    }
    try {
        var script = '/usr/bin/textutil -convert txt -stdout ' + shellQuote(path);
        return String(app.doShellScript(script));
    } catch (error) {
        return null;
    }
}

function nsStringToJS(nsValue) {
    if (nsValue === null || nsValue === undefined) return null;
    try {
        var text = String(ObjC.unwrap(nsValue));
        if (text === 'undefined' || text === 'null') return null;
        return text;
    } catch (error) {
        try {
            var direct = String(nsValue);
            if (direct && direct !== 'undefined' && direct.indexOf('[ID ') !== 0 && direct.indexOf('[object') !== 0) {
                return direct;
            }
        } catch (ignored2) {}
        return null;
    }
}

function readPlainTextFile(path) {
    try {
        var errorRef = Ref();
        var nsstr = $.NSString.stringWithContentsOfFileEncodingError(
            $.NSString.stringWithString(path), NS_UTF8_STRING_ENCODING, errorRef
        );
        return nsStringToJS(nsstr);
    } catch (error) {
        return null;
    }
}

// ---- Batch pipeline ----

function processSingleLyricsFile(sourcePath, verseColor, chorusColor, bridgeColor) {
    var rawText = readLyricsText(sourcePath);
    if (rawText === null || rawText.replace(/\s+/g, '') === '') {
        return {success: false, error: T('errNoText')};
    }

    var paragraphs = formatLyrics(rawText);
    if (paragraphs.length === 0) {
        return {success: false, error: T('errNoLyrics')};
    }

    for (var p = 0; p < paragraphs.length; p++) {
        for (var l = 0; l < paragraphs[p].lines.length; l++) {
            paragraphs[p].lines[l] = paragraphs[p].lines[l].toUpperCase();
        }
    }

    var rendered = renderLyricsImage(paragraphs, verseColor, chorusColor, bridgeColor);
    var outputName = baseName(fileName(sourcePath)) + '.' + batchSaveFormat;
    var outputPath = joinPath(batchSaveFolder, outputName);

    var exportResult = exportRaster(rendered.bitmapRep, batchSaveFormat, outputPath);
    return {
        success: true,
        outputPath: outputPath,
        bytes: exportResult.bytes,
        fontSize: rendered.fontSize,
        overflow: rendered.overflow
    };
}

// Пакетная обработка идёт ПО ОДНОМУ ФАЙЛУ ЗА ТАКТ ЦИКЛА ПРОСТОЯ, а не
// одним длинным циклом внутри обработчика меню.
//
// Отрисовка одной картинки создаёт десятки мегабайт временных объектов
// AppKit (NSImage под холст 1400x1960, который на Retina-экране вдвое
// больше по каждой стороне, его TIFF-представление и до десяти вариантов
// JPEG при подборе размера). Такие объекты освобождаются, когда
// управление возвращается в цикл событий. Пока весь прогон шёл одним
// циклом внутри обработчика меню, возврата не происходило до самого
// конца — память росла с каждым файлом, и приложение падало в конце
// прогона.
//
// Возврат в цикл событий после каждого файла решает это штатным путём,
// без ручного управления памятью: пробовать делать это через свой
// NSAutoreleasePool нельзя — мост JXA держит ссылки на объекты в пуле, и
// его слив роняет приложение сразу, ещё до обработки первого файла.
//
// Такты запускает idle() (см. processBatchStep) — тем же способом, каким
// в приложении уже работают отложенная перемотка и размещение окна.
function startBatchFormatting() {
    if (batchRunning) return;
    if (batchFiles.length === 0) {
        showError(T('errBatchNoFiles'));
        return;
    }
    if (batchSaveFolder === '') {
        showError(T('errBatchNoFolder'));
        return;
    }

    batchQueue = batchFiles.slice();
    batchTotal = batchFiles.length;
    batchSucceeded = 0;
    batchFailed = [];
    batchOverflowed = [];
    batchLogLines = [];
    batchRunning = true;
    batchDeadline = Date.now();
    batchLog('batch started: ' + batchTotal + ' file(s), format=' + batchSaveFormat);
}

function cancelBatchFormatting() {
    batchRunning = false;
    batchQueue = [];
    batchDeadline = 0;
    // finishBatchFormatting вызывает отмену ДО того, как выставит сводку,
    // поэтому очистка здесь не мешает ей показаться, но снимает висящую
    // сводку при выходе из приложения.
    batchSummaryPending = null;
    batchSummaryDeadline = 0;
    batchSummaryFolder = '';
}

// Один файл за вызов. Цвета создаются заново на каждом шаге намеренно:
// это дёшево, зато между тактами не остаётся ни одной ссылки на объекты
// AppKit, которые цикл событий к тому моменту уже мог освободить.
function processBatchStep() {
    if (!batchRunning) return;

    if (batchQueue.length === 0) {
        finishBatchFormatting();
        return;
    }

    var sourcePath = batchQueue.shift();
    batchLog('start file: ' + fileName(sourcePath) + ' (' + (batchTotal - batchQueue.length) + ' of ' + batchTotal + ')');
    try {
        var verseColor = colorFromHex(batchVerseColorHex);
        var chorusColor = colorFromHex(batchChorusColorHex);
        var bridgeColor = colorFromHex(batchBridgeColorHex);

        var result = processSingleLyricsFile(sourcePath, verseColor, chorusColor, bridgeColor);
        if (result.success) {
            batchSucceeded++;
            if (result.overflow) batchOverflowed.push(fileName(sourcePath));
            batchLog('  saved: ' + result.outputPath + ' (' + result.bytes + ' bytes, font ' + result.fontSize + ')');
        } else {
            batchFailed.push(fileName(sourcePath) + ' — ' + result.error);
            batchLog('  failed: ' + result.error);
        }
    } catch (error) {
        batchFailed.push(fileName(sourcePath) + ' — ' + String(error));
        batchLog('  exception: ' + String(error));
    }

    if (batchQueue.length === 0) {
        finishBatchFormatting();
    } else {
        batchDeadline = Date.now();
    }
}

function finishBatchFormatting() {
    var summary = T('batchSummaryPrefix') + batchSucceeded + T('batchSummaryMiddle') + batchTotal + '.';
    if (batchOverflowed.length > 0) {
        summary += T('batchOverflowNote') + batchOverflowed.join('\n');
    }
    if (batchFailed.length > 0) {
        summary += T('batchFailedNote') + batchFailed.join('\n');
    }

    batchLog('all files done: ok=' + batchSucceeded + ' of ' + batchTotal +
             ', failed=' + batchFailed.length + ', overflowed=' + batchOverflowed.length);

    cancelBatchFormatting();

    // Диалог показывается НЕ здесь, а отдельным тактом цикла простоя чуть
    // позже. Здесь мы находимся непосредственно после отрисовки последнего
    // файла, и именно в этот момент во всех предыдущих версиях приложение
    // падало. Пауза даёт циклу событий полностью провернуться и прибрать за
    // отрисовкой прежде, чем AppKit начнёт рисовать собственное окно
    // диалога.
    batchSummaryPending = summary;
    batchSummaryDeadline = Date.now() + 400;
}

// Журнал пакетной обработки — обычный текстовый файл рядом с результатами,
// в выбранной папке сохранения. Нужен потому, что вылет обрывает
// приложение молча: по последней записи в журнале сразу видно, докуда
// работа дошла — до конца обработки, до показа сводки или после неё.
function batchLog(message) {
    batchLogInto(batchSaveFolder, message);
}

// Тот же журнал, но с явной папкой: переименование работает не в папке
// сохранения картинок, а в той, которую выбрали для переименования.
function batchLogInto(folder, message) {
    try {
        if (folder === '' || folder === null || folder === undefined) return;
        batchLogLines.push(new Date().toISOString() + '  ' + message);
        var path = joinPath(folder, 'PressNextLive-batch-log.txt');
        var text = batchLogLines.join('\n') + '\n';
        $.NSString.stringWithString(text).writeToFileAtomicallyEncodingError(
            $.NSString.stringWithString(path), true, $.NSUTF8StringEncoding, null
        );
    } catch (ignored) {}
}

function showPendingBatchSummary() {
    var summary = batchSummaryPending;
    var folder = batchSummaryFolder !== '' ? batchSummaryFolder : batchSaveFolder;
    batchSummaryPending = null;
    batchSummaryDeadline = 0;
    batchSummaryFolder = '';
    if (summary === null) return;

    batchLogInto(folder, 'about to show summary dialog');
    try { app.activate(); } catch (ignored) {}
    try {
        app.displayDialog(summary, {withTitle: T('batchMenu'), buttons: ['OK'], defaultButton: 'OK'});
    } catch (ignored) {}
    batchLogInto(folder, 'summary dialog closed — finished cleanly');
}

// ---------------------------------------------------------------------
// Пакетное переименование
// ---------------------------------------------------------------------
// Две операции над именами файлов. Обе только переименовывают, ничего не
// создают и не удаляют, обе сначала показывают, что именно собираются
// сделать, и обе никогда не перезаписывают существующий файл.

var RENAME_LYRICS_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf', 'docx', 'txt'];

// Имя для сравнения: регистр, пробелы и знаки препинания при сопоставлении
// не значат ничего — они нужны только в имени-цели. Так «yesterday» из
// yesterday.jpg находит «Yesterday E >>8» из Yesterday E >>8.wav.
function normalizedForMatch(name) {
    return String(name)
        .toLowerCase()
        // Апострофы убираются совсем: они стоят внутри слова, и замена их
        // на пробел разрывала бы «don't» на «don t», из-за чего файл с
        // именем «dont-look-back» не находил бы «Don't Look Back».
        .replace(/['\u2019`]/g, '')
        // Остальные разделители — наоборот, становятся пробелом, чтобы
        // «dont-look-back» читалось как три слова.
        .replace(/[_\-.,"!?()\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Слова, ничего не значащие при сравнении. «The» пишут то в начале
// исполнителя, то нигде («The Beatles» и «Beatles» — одно и то же), поэтому
// при сравнении оно просто выбрасывается. В имя-цель это не влияет:
// целевое имя всегда берётся у минусовки целиком, как есть.
var MATCH_NOISE_WORDS = ['the'];

// Остатки английских сокращений: апостроф в имени файла часто оказывается
// заменён пробелом («Let's» -> «Let s»), и тогда обломок становится
// отдельным словом. Такие обломки приклеиваются обратно к предыдущему
// слову, и «let s twist» снова читается как «lets twist».
//
// Буквы «d» в списке намеренно нет, хотя «I'd» — тоже сокращение: в именах
// файлов одиночная «d» почти всегда обозначает тональность («Yesterday D
// >>6»), и склейка сломала бы сопоставление таких имён.
var CONTRACTION_TAILS = ['s', 't', 'm', 'll', 're', 've'];

function wordsFromNormalized(normalized) {
    var parts = normalized.split(' ');
    var words = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '') continue;
        if (MATCH_NOISE_WORDS.indexOf(parts[i]) >= 0) continue;
        words.push(parts[i]);
    }
    return words;
}

function repairedNormalized(normalized) {
    var parts = normalized.split(' ');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '') continue;
        if (out.length > 0 && CONTRACTION_TAILS.indexOf(parts[i]) >= 0) {
            out[out.length - 1] = out[out.length - 1] + parts[i];
        } else {
            out.push(parts[i]);
        }
    }
    return out.join(' ');
}

function matchWords(name) {
    return wordsFromNormalized(normalizedForMatch(name));
}

function totalWordLength(words) {
    var total = 0;
    for (var i = 0; i < words.length; i++) total += words[i].length;
    return total;
}

function everyWordPresent(needles, haystack) {
    for (var i = 0; i < needles.length; i++) {
        if (haystack.indexOf(needles[i]) < 0) return false;
    }
    return true;
}

// Сравнение идёт тремя ступенями, от самой надёжной к самой свободной, и
// оценка каждой следующей заведомо ниже предыдущей — так точное совпадение
// всегда побеждает совпадение по началу, а оно, в свою очередь, побеждает
// совпадение по набору слов.
//
// 1. Имена совпадают полностью.
// 2. Одно имя — начало другого, с границей по слову: «Yesterday» находит
//    «Yesterday E >>8», но «creep» не цепляется к «Creeper».
// 3. Все слова короткого имени есть в длинном, в любом порядке: так
//    «Yesterday - Beatles» находит «Beatles - Yesterday», а «Yesterday» —
//    «Beatles - Yesterday». Порядок слов в именах у людей гуляет, и
//    определять, где тут исполнитель, а где песня, не требуется: целевое
//    имя всё равно берётся у минусовки целиком.
function scoreNormalizedPair(a, b) {
    if (a === '' || b === '') return 0;
    if (a === b) return 100000;

    var shorter = a.length < b.length ? a : b;
    var longer = a.length < b.length ? b : a;
    if (longer.indexOf(shorter) === 0 && longer.charAt(shorter.length) === ' ') {
        return 10000 + shorter.length;
    }

    var aWords = wordsFromNormalized(a);
    var bWords = wordsFromNormalized(b);
    if (aWords.length === 0 || bWords.length === 0) return 0;

    var shortWords = aWords.length <= bWords.length ? aWords : bWords;
    var longWords = aWords.length <= bWords.length ? bWords : aWords;

    // Слишком короткое имя (одна-две буквы) совпало бы со слишком многим.
    if (totalWordLength(shortWords) < 3) return 0;
    if (!everyWordPresent(shortWords, longWords)) return 0;

    return 100 + totalWordLength(shortWords);
}

// Каждое имя сравнивается в двух видах — как есть и с приклеенными
// обломками сокращений — и берётся лучший результат. Так «Let s Twist
// Again ...png» находит «Let's Twist Again ...wav», при этом имена без
// сокращений сравниваются ровно как раньше.
function matchScore(lyricsBase, audioBase) {
    var a = normalizedForMatch(lyricsBase);
    var b = normalizedForMatch(audioBase);
    var aVariants = [a];
    var bVariants = [b];

    var aRepaired = repairedNormalized(a);
    if (aRepaired !== a) aVariants.push(aRepaired);
    var bRepaired = repairedNormalized(b);
    if (bRepaired !== b) bVariants.push(bRepaired);

    var best = 0;
    for (var i = 0; i < aVariants.length; i++) {
        for (var j = 0; j < bVariants.length; j++) {
            var score = scoreNormalizedPair(aVariants[i], bVariants[j]);
            if (score > best) best = score;
        }
    }
    return best;
}

function planLyricsRename(folder) {
    var names = namesInFolder(folder);
    if (names === null) return null;

    var audioNames = [];
    var lyricsNames = [];
    for (var i = 0; i < names.length; i++) {
        var extension = extensionOf(names[i]).toLowerCase();
        if (extension === 'mp3' || extension === 'wav') {
            audioNames.push(names[i]);
        } else if (RENAME_LYRICS_EXTENSIONS.indexOf(extension) >= 0) {
            lyricsNames.push(names[i]);
        }
    }

    var plan = [];
    var skipped = [];

    for (var l = 0; l < lyricsNames.length; l++) {
        var lyricsName = lyricsNames[l];
        var lyricsBase = baseName(lyricsName);
        var lyricsExtension = extensionOf(lyricsName);

        var bestScore = 0;
        var bestAudioBase = null;
        var bestIsTie = false;

        for (var a = 0; a < audioNames.length; a++) {
            var audioBase = baseName(audioNames[a]);
            var score = matchScore(lyricsBase, audioBase);
            if (score === 0) continue;
            if (score > bestScore) {
                bestScore = score;
                bestAudioBase = audioBase;
                bestIsTie = false;
            } else if (score === bestScore && audioBase !== bestAudioBase) {
                bestIsTie = true;
            }
        }

        if (bestAudioBase === null) {
            // Раньше такие файлы просто молча игнорировались, и после
            // прогона нельзя было понять, что осталось разобрать руками.
            skipped.push(lyricsName + ' — ' + T('skipNoMatch'));
            continue;
        }
        // Уже совпадает — трогать нечего.
        if (bestAudioBase === lyricsBase) continue;

        if (bestIsTie) {
            skipped.push(lyricsName + ' — ' + T('skipAmbiguous'));
            continue;
        }

        var targetName = bestAudioBase + '.' + lyricsExtension;
        if (names.indexOf(targetName) >= 0) {
            skipped.push(lyricsName + ' — ' + T('skipExists'));
            continue;
        }

        plan.push({from: lyricsName, to: targetName});
    }

    return {plan: plan, skipped: skipped, hadLyrics: lyricsNames.length > 0};
}

function matchLyricsNamesToTracks() {
    if (fileChooserIsOpen) return;

    var folder = null;
    fileChooserIsOpen = true;
    pauseGlobalKeyMonitorForFilePanel();
    try {
        app.activate();
        var selected = app.chooseFolder({withPrompt: T('matchFolderPrompt')});
        folder = normalizePath(String(selected));
    } catch (error) {
        folder = null;
    } finally {
        fileChooserIsOpen = false;
        resumeGlobalKeyMonitorAfterFilePanel();
    }
    if (folder === null) return;

    var planned = planLyricsRename(folder);
    if (planned === null) {
        showError(T('errFolderUnreadable'));
        return;
    }
    if (planned.plan.length === 0) {
        // Переименовывать нечего — но если что-то не сопоставилось, об этом
        // нужно сказать, а не отделываться «всё и так совпадает».
        if (planned.skipped.length > 0) {
            batchLogLines = [];
            batchLogInto(folder, 'nothing to rename; ' + planned.skipped.length + ' file(s) not matched');
            for (var s = 0; s < planned.skipped.length; s++) {
                batchLogInto(folder, '  skipped: ' + planned.skipped[s]);
            }
            showError(T('matchNothingToDo') + skippedForDialog(planned.skipped));
        } else {
            showError(planned.hadLyrics ? T('matchNothingToDo') : T('matchNoPairs'));
        }
        return;
    }

    var question = T('matchConfirmPrefix') + planned.plan.length + T('matchConfirmSuffix') +
        renamePreview(planned.plan);
    if (!confirmRename(question)) return;

    applyRenamePlan(folder, planned.plan, planned.skipped);
}

function removeStartingThe() {
    renameChosenFiles(
        T('removeThePrompt'),
        T('removeTheConfirmPrefix'),
        T('removeTheConfirmSuffix'),
        function (base) {
            // Только настоящее слово The в начале: «The Doors» подпадает,
            // «Theatre» — нет, потому что после The обязателен пробел.
            var match = /^the\s+(.+)$/i.exec(base);
            if (match === null) return {skip: T('skipNoThe')};
            return {base: match[1]};
        }
    );
}

function resetManualSongSorting() {
    renameChosenFiles(
        T('resetFilesPrompt'),
        T('resetConfirmPrefix'),
        T('resetConfirmSuffix'),
        function (base) {
            // Пустое имя после обрезки — верный признак, что файл выбран по
            // ошибке; такой пропускаем, а не превращаем в файл без имени.
            if (base.length <= 3) return {skip: T('resetTooShort')};
            return {base: base.substring(3)};
        }
    );
}

// Общий костяк для команд, которые меняют имена выбранных файлов по
// одному правилу: выбор файлов, построение плана, подтверждение,
// применение. Различаются такие команды только подписями и функцией
// transform(base), которая возвращает либо новое имя без расширения,
// либо причину пропуска.
function renameChosenFiles(prompt, confirmPrefix, confirmSuffix, transform) {
    if (fileChooserIsOpen) return;

    var selected = null;
    fileChooserIsOpen = true;
    pauseGlobalKeyMonitorForFilePanel();
    try {
        app.activate();
        selected = app.chooseFile({withPrompt: prompt, multipleSelectionsAllowed: true});
    } catch (error) {
        selected = null;
    } finally {
        fileChooserIsOpen = false;
        resumeGlobalKeyMonitorAfterFilePanel();
    }
    if (selected === null) return;

    var paths = [];
    try {
        for (var i = 0; i < selected.length; i++) paths.push(normalizePath(String(selected[i])));
    } catch (error) {
        return;
    }
    if (paths.length === 0) return;

    var folder = directoryName(paths[0]);
    var existing = namesInFolder(folder);
    if (existing === null) existing = [];

    // Имена, которые появятся по ходу прогона, тоже занимают место: без
    // этого два файла могли бы нацелиться на одно и то же имя, и второе
    // переименование затёрло бы первое.
    var claimed = [];
    var plan = [];
    var skipped = [];

    for (var p = 0; p < paths.length; p++) {
        var name = fileName(paths[p]);
        var base = baseName(name);
        var extension = extensionOf(name);

        var outcome = transform(base);
        if (outcome.skip !== undefined) {
            skipped.push(name + ' — ' + outcome.skip);
            continue;
        }

        var targetBase = outcome.base;
        if (targetBase === '') {
            skipped.push(name + ' — ' + T('resetTooShort'));
            continue;
        }

        var targetName = extension === '' ? targetBase : targetBase + '.' + extension;
        if (targetName === name) continue;
        if (existing.indexOf(targetName) >= 0 || claimed.indexOf(targetName) >= 0) {
            skipped.push(name + ' — ' + T('skipExists'));
            continue;
        }

        claimed.push(targetName);
        plan.push({from: name, to: targetName});
    }

    if (plan.length === 0) {
        showError(skipped.length > 0
            ? T('matchNothingToDo') + skippedForDialog(skipped)
            : T('matchNothingToDo'));
        return;
    }

    var question = confirmPrefix + plan.length + confirmSuffix + renamePreview(plan);
    if (!confirmRename(question)) return;

    applyRenamePlan(folder, plan, skipped);
}

// Показывает до трёх примеров — этого хватает, чтобы увидеть, что именно
// произойдёт, и не превращает окно подтверждения в простыню.
function renamePreview(plan) {
    var lines = [];
    for (var i = 0; i < plan.length && i < 3; i++) {
        lines.push(plan[i].from + '  ->  ' + plan[i].to);
    }
    if (plan.length > 3) lines.push('…');
    return T('renameExamples') + lines.join('\n');
}

function confirmRename(question) {
    try {
        var renameLabel = T('renameConfirmButton');
        var cancelLabel = T('cancelButton');
        var result = app.displayDialog(question, {
            withTitle: 'PressNext Live',
            buttons: [cancelLabel, renameLabel],
            defaultButton: renameLabel,
            cancelButton: cancelLabel
        });
        return String(result.buttonReturned) === renameLabel;
    } catch (error) {
        return false;
    }
}

// Пропущенных может оказаться много — в окне показываются первые 20, а
// полный список всегда лежит в журнале рядом с файлами.
function skippedForDialog(skipped) {
    if (skipped.length === 0) return '';
    var shown = skipped.slice(0, 20);
    var text = T('renameSkippedNote') + shown.join('\n');
    if (skipped.length > shown.length) {
        text += T('andMorePrefix') + (skipped.length - shown.length) + T('andMoreSuffix');
    }
    return text;
}

function applyRenamePlan(folder, plan, skipped) {
    batchLogLines = [];
    batchLogInto(folder, 'rename started: ' + plan.length + ' file(s) planned, ' +
                 skipped.length + ' skipped before start');
    for (var s = 0; s < skipped.length; s++) {
        batchLogInto(folder, '  skipped: ' + skipped[s]);
    }

    var renamed = 0;
    for (var i = 0; i < plan.length; i++) {
        var fromPath = joinPath(folder, plan[i].from);
        var toPath = joinPath(folder, plan[i].to);
        var moved = false;
        try {
            var errorRef = Ref();
            moved = $.NSFileManager.defaultManager.moveItemAtPathToPathError($(fromPath), $(toPath), errorRef);
        } catch (error) {
            moved = false;
        }
        if (moved) {
            renamed++;
            batchLogInto(folder, '  ok: ' + plan[i].from + '  ->  ' + plan[i].to);
        } else {
            skipped.push(plan[i].from + ' — ' + T('skipFailed'));
            batchLogInto(folder, '  FAILED: ' + plan[i].from + '  ->  ' + plan[i].to);
        }
    }

    batchLogInto(folder, 'all renames done: ' + renamed + ' renamed, ' + skipped.length + ' skipped');

    var summary = T('renameDonePrefix') + renamed + '.' + skippedForDialog(skipped);

    // Сводка показывается НЕ здесь, а отдельным тактом цикла простоя — тем
    // же способом, что и сводка пакетного форматирования. Показ окна сразу
    // после работы уже приводил к вылету в пакетном форматировании, и здесь
    // повторялось то же самое.
    batchSummaryFolder = folder;
    batchSummaryPending = summary;
    batchSummaryDeadline = Date.now() + 400;
}

// ---- Menu action handlers ----

function chooseBatchFiles() {
    if (fileChooserIsOpen) return;
    fileChooserIsOpen = true;
    pauseGlobalKeyMonitorForFilePanel();
    try {
        app.activate();
        var selected = app.chooseFile({
            withPrompt: T('chooseFilesPrompt'),
            ofType: ['public.plain-text', 'org.openxmlformats.wordprocessingml.document', 'public.rtf'],
            multipleSelectionsAllowed: true
        });
        var paths = [];
        for (var i = 0; i < selected.length; i++) paths.push(normalizePath(String(selected[i])));
        batchFiles = paths;
        savePreferences();
        updateBatchMenuStates();
    } catch (error) {
        // Отменено пользователем.
    } finally {
        fileChooserIsOpen = false;
        resumeGlobalKeyMonitorAfterFilePanel();
    }
}

function chooseBatchFolder() {
    if (fileChooserIsOpen) return;
    fileChooserIsOpen = true;
    pauseGlobalKeyMonitorForFilePanel();
    try {
        app.activate();
        var selected = app.chooseFolder({withPrompt: T('chooseSaveFolderPrompt')});
        batchSaveFolder = normalizePath(String(selected));
        savePreferences();
        updateBatchMenuStates();
    } catch (error) {
        // Отменено пользователем.
    } finally {
        fileChooserIsOpen = false;
        resumeGlobalKeyMonitorAfterFilePanel();
    }
}

function selectBatchFormat(index) {
    if (index < 0 || index >= BATCH_FORMAT_VALUES.length) return;
    batchSaveFormat = BATCH_FORMAT_VALUES[index];
    savePreferences();
    updateBatchMenuStates();
}

function chooseBatchColor(index) {
    var contexts = ['verse', 'chorus', 'bridge'];
    if (index < 0 || index >= contexts.length) return;
    colorPickerContext = contexts[index];
    var currentHex = index === 0 ? batchVerseColorHex : (index === 1 ? batchChorusColorHex : batchBridgeColorHex);

    try {
        var panel = $.NSColorPanel.sharedColorPanel;
        panel.setTarget(settingsMenuController);
        panel.setAction($.NSSelectorFromString('changeBatchColor:'));
        panel.color = colorFromHex(currentHex);
        app.activate();
        panel.makeKeyAndOrderFront(null);
    } catch (error) {
        showError(T('errColorPanel'));
    }
}

function changeBatchColor(sender) {
    try {
        var hex = hexFromNSColor(sender.color);
        if (colorPickerContext === 'verse') batchVerseColorHex = hex;
        else if (colorPickerContext === 'chorus') batchChorusColorHex = hex;
        else if (colorPickerContext === 'bridge') batchBridgeColorHex = hex;
        savePreferences();
        updateBatchMenuStates();
    } catch (ignored) {}
}

function chooseBatchFont() {
    try {
        var manager = $.NSFontManager.sharedFontManager;
        manager.setTarget(settingsMenuController);
        manager.setAction($.NSSelectorFromString('changeBatchFont:'));
        var baseFont = fontForSize(48, resolveBatchFontPSName());
        manager.setSelectedFontIsMultiple(baseFont, false);
        app.activate();
        manager.orderFrontFontPanel(null);
    } catch (error) {
        showError(T('errFontPanel'));
    }
}

function safeFontNameFromFont(fontObj) {
    if (fontObj === null || fontObj === undefined) return null;
    try {
        var name = fontObj.fontName;
        return nsStringToJS(name);
    } catch (ignored) {}
    return null;
}

function changeBatchFont(sender) {
    try {
        var manager = $.NSFontManager.sharedFontManager;
        var base = fontForSize(48, resolveBatchFontPSName());
        var newFont = manager.convertFont(base);
        var name = safeFontNameFromFont(newFont);
        if (name !== null) {
            batchFontName = name;
            savePreferences();
            updateBatchMenuStates();
        }
    } catch (ignored) {}
}

function updateBatchMenuStates() {
    try {
        if (batchFilesInfoItem !== null) {
            batchFilesInfoItem.title = $.NSString.stringWithString(T('filesSelectedPrefix') + batchFiles.length);
        }
        if (batchFontInfoItem !== null) {
            var shownName = batchFontName !== '' ? batchFontName : (T('fontAutoPrefix') + (resolveBatchFontPSName() || T('systemFont')) + ')');
            batchFontInfoItem.title = $.NSString.stringWithString(T('fontPrefix') + shownName);
        }
        if (batchFolderInfoItem !== null) {
            batchFolderInfoItem.title = $.NSString.stringWithString(T('folderPrefix') + (batchSaveFolder === '' ? T('folderNotSelected') : batchSaveFolder));
        }
        for (var f = 0; f < batchFormatMenuItems.length; f++) {
            batchFormatMenuItems[f].state = (BATCH_FORMAT_VALUES[f] === batchSaveFormat) ? 1 : 0;
        }
        if (batchVerseColorItem !== null) batchVerseColorItem.title = $.NSString.stringWithString(T('verseColorPrefix') + batchVerseColorHex + ')');
        if (batchChorusColorItem !== null) batchChorusColorItem.title = $.NSString.stringWithString(T('chorusColorPrefix') + batchChorusColorHex + ')');
        if (batchBridgeColorItem !== null) batchBridgeColorItem.title = $.NSString.stringWithString(T('bridgeColorPrefix') + batchBridgeColorHex + ')');
    } catch (ignored) {}
}
