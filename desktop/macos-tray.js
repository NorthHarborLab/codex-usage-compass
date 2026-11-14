// Run with /usr/bin/osascript -l JavaScript. Uses only AppKit/Foundation;
// no Apple Events, Accessibility permission, shell commands or account access.
ObjC.import('AppKit');
ObjC.import('Foundation');
ObjC.import('stdlib');

var app, statusItem, menu, delegate, input, output, pending, separator;
var rowItems = [], refreshItem, hideItem, englishItem, chineseItem;
var previousIcon = '', testMode = false, frames = 0;

function emit(event) {
  output.writeData($(JSON.stringify(event) + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
}
function finish(code) {
  if (statusItem) $.NSStatusBar.systemStatusBar.removeStatusItem(statusItem);
  $.exit(code);
}
function item(title, action) {
  var result = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent($(title), action || null, $(''));
  result.enabled = !!action;
  if (action) result.target = delegate;
  return result;
}
function drawRing(colour, fill) {
  var image = $.NSImage.alloc.initWithSize($.NSMakeSize(18, 18));
  image.lockFocus;
  try {
    var track = $.NSBezierPath.bezierPathWithOvalInRect($.NSMakeRect(2, 2, 14, 14));
    track.lineWidth = 2;
    $.NSColor.colorWithCalibratedWhiteAlpha(0.5, 0.35).setStroke;
    track.stroke;
    var rgb = parseInt(colour.slice(1), 16);
    $.NSColor.colorWithCalibratedRedGreenBlueAlpha(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1).setStroke;
    if (fill >= 100) track.stroke;
    else if (fill > 0) {
      var arc = $.NSBezierPath.bezierPath;
      arc.lineWidth = 2;
      arc.appendBezierPathWithArcWithCenterRadiusStartAngleEndAngleClockwise($.NSMakePoint(9, 9), 7, 90, 90 - fill * 3.6, true);
      arc.stroke;
    }
  } finally { image.unlockFocus; }
  image.template = false;
  return image;
}
function render(frame) {
  if (!Array.isArray(frame.rows) || frame.rows.length !== 13 || !/^#[\da-f]{6}$/i.test(frame.colour)) throw Error('Invalid tray frame');
  frame.rows.forEach(function (text, i) {
    if (rowItems[i] && typeof text === 'string') rowItems[i].title = $(text);
  });
  for (var i = 8; i <= 12; i++) menu.itemAtIndex(i).hidden = !frame.showFiveHour;
  refreshItem.title = $(frame.refresh);
  hideItem.title = $(frame.hide);
  englishItem.state = frame.locale === 'en' ? 1 : 0;
  chineseItem.state = frame.locale === 'zh-CN' ? 1 : 0;
  statusItem.button.title = $(frame.shortText || '—');
  statusItem.button.toolTip = $(frame.tooltip);
  var fill = Math.max(0, Math.min(100, Number(frame.fill) || 0));
  var key = frame.colour + ':' + fill.toFixed(2);
  if (key !== previousIcon) {
    statusItem.button.image = drawRing(frame.colour, fill);
    previousIcon = key;
  }
  frames++;
}
function receive(message) {
  // Test-only commands exercise real NSMenu target/actions without UI automation.
  if (testMode && message.test === 'inspect') {
    emit({ action: 'inspection', frames: frames, title: ObjC.unwrap(statusItem.button.title),
      tooltip: ObjC.unwrap(statusItem.button.toolTip), imageWidth: statusItem.button.image.size.width,
      rows: rowItems.map(function (row) { return row ? ObjC.unwrap(row.title) : null; }),
      english: Number(englishItem.state), chinese: Number(chineseItem.state),
      shortHidden: menu.itemAtIndex(8).hidden, shortSeparatorHidden: menu.itemAtIndex(12).hidden });
  } else if (testMode && message.test === 'click') {
    var actions = { refresh: refreshItem, hide: hideItem, en: englishItem, 'zh-CN': chineseItem };
    var target = actions[message.item];
    if (target) app.sendActionToFrom(target.action, delegate, target);
  } else render(message);
}

ObjC.registerSubclass({
  name: 'UsageCompassMenuDelegate',
  superclass: 'NSObject',
  methods: {
    'refresh:': { types: ['void', ['id']], implementation: function () { emit({ action: 'refresh' }); } },
    'hide:': { types: ['void', ['id']], implementation: function () { emit({ action: 'hide' }); } },
    'english:': { types: ['void', ['id']], implementation: function () { emit({ action: 'language', locale: 'en' }); } },
    'chinese:': { types: ['void', ['id']], implementation: function () { emit({ action: 'language', locale: 'zh-CN' }); } },
    'readInput:': { types: ['void', ['id']], implementation: function (notification) {
      try {
        var data = notification.userInfo.objectForKey($.NSFileHandleNotificationDataItem);
        if (Number(data.length) === 0) finish(0); // Parent exited or closed its pipe.
        pending.appendData(data);
        if (pending.length > 1048576) throw Error('Oversized frame');
        while (pending.length) {
          var range = pending.rangeOfDataOptionsRange(separator, 0, $.NSMakeRange(0, pending.length));
          // JXA exposes NSUInteger struct fields as strings on some runtimes.
          var location = Number(range.location), length = Number(range.length);
          if (location >= pending.length) break;
          var line = $.NSString.alloc.initWithDataEncoding(pending.subdataWithRange($.NSMakeRange(0, location)), $.NSUTF8StringEncoding);
          var consumed = location + length;
          pending = $.NSMutableData.dataWithData(pending.subdataWithRange($.NSMakeRange(consumed, pending.length - consumed)));
          try { receive(JSON.parse(ObjC.unwrap(line))); }
          catch (error) { emit({ action: 'render-error', message: testMode ? String(error) + ' ' + error.stack : undefined }); }
        }
        input.readInBackgroundAndNotifyForModes($([$.NSRunLoopCommonModes]));
      } catch (error) {
        emit({ action: 'render-error', message: testMode ? String(error) + ' ' + error.stack : undefined });
        finish(1);
      }
    } }
  }
});

function run(argv) {
  testMode = argv.indexOf('--self-test') !== -1;
  output = $.NSFileHandle.fileHandleWithStandardOutput;
  app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  delegate = $.UsageCompassMenuDelegate.alloc.init;
  menu = $.NSMenu.alloc.initWithTitle($('Codex Usage Compass'));
  menu.autoenablesItems = false;
  for (var i = 0; i < 13; i++) {
    if (i === 2 || i === 7 || i === 12) { menu.addItem($.NSMenuItem.separatorItem); rowItems.push(null); }
    else { var row = item('—'); rowItems.push(row); menu.addItem(row); }
    if (i >= 8) menu.itemAtIndex(i).hidden = true;
  }
  refreshItem = item('Refresh', 'refresh:'); menu.addItem(refreshItem);
  var languages = item('Language / 语言'); languages.enabled = true;
  var submenu = $.NSMenu.alloc.initWithTitle($('Language')); submenu.autoenablesItems = false;
  englishItem = item('English', 'english:'); chineseItem = item('简体中文', 'chinese:');
  submenu.addItem(englishItem); submenu.addItem(chineseItem); languages.submenu = submenu; menu.addItem(languages);
  hideItem = item('Hide system ring', 'hide:'); menu.addItem(hideItem);
  statusItem = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
  statusItem.menu = menu;
  statusItem.button.imagePosition = $.NSImageLeft;
  statusItem.button.image = drawRing('#A1B0BF', 0);
  statusItem.button.title = $('—');
  statusItem.button.toolTip = $('Codex Usage Compass');
  pending = $.NSMutableData.data;
  separator = $('\n').dataUsingEncoding($.NSUTF8StringEncoding);
  input = $.NSFileHandle.fileHandleWithStandardInput;
  $.NSNotificationCenter.defaultCenter.addObserverSelectorNameObject(delegate, 'readInput:', $.NSFileHandleReadCompletionNotification, input);
  input.readInBackgroundAndNotifyForModes($([$.NSRunLoopCommonModes]));
  emit({ action: 'ready' });
  app.run;
}
