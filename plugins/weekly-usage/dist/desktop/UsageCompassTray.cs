// Windows 10+ / Windows PowerShell 5.1 / .NET Framework. No NuGet packages.
using System;
using System.Collections;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public static class UsageCompassTray {
    [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr handle);
    private static string latest;
    private static volatile bool ended;
    private static NotifyIcon tray;
    private static ContextMenuStrip menu;
    private static ToolStripMenuItem refresh, hide;
    private static string lastIcon;
    private static readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private static void Send(string action) { Console.WriteLine(action); Console.Out.Flush(); }
    private static string Text(IDictionary data, string key) { return Convert.ToString(data[key]); }

    private static void Create() {
        Application.EnableVisualStyles();
        tray = new NotifyIcon();
        menu = new ContextMenuStrip();
        // 13 rows: guidance, separator, and four values per quota window.
        for (int i = 0; i < 13; i++) {
            if (i == 2 || i == 7 || i == 12) menu.Items.Add(new ToolStripSeparator());
            else menu.Items.Add(new ToolStripMenuItem("…") { Enabled = false });
        }
        refresh = new ToolStripMenuItem("Refresh");
        refresh.Click += delegate { Send("{\"action\":\"refresh\"}"); };
        menu.Items.Add(refresh);
        var language = new ToolStripMenuItem("Language / 语言");
        var english = new ToolStripMenuItem("English");
        var chinese = new ToolStripMenuItem("简体中文");
        english.Click += delegate { Send("{\"action\":\"language\",\"locale\":\"en\"}"); };
        chinese.Click += delegate { Send("{\"action\":\"language\",\"locale\":\"zh-CN\"}"); };
        language.DropDownItems.Add(english);
        language.DropDownItems.Add(chinese);
        menu.Items.Add(language);
        hide = new ToolStripMenuItem("Hide system ring");
        hide.Click += delegate { Send("{\"action\":\"hide\"}"); Application.Exit(); };
        menu.Items.Add(hide);
        tray.ContextMenuStrip = menu;
        tray.MouseClick += delegate(object sender, MouseEventArgs e) {
            if (e.Button == MouseButtons.Left) menu.Show(Cursor.Position);
        };
        UpdateIcon("#A1B0BF", 0);
        tray.Text = "Codex Usage Compass";
        tray.Visible = true;
    }
    private static void UpdateIcon(string colour, double fill) {
        fill = Math.Max(0, Math.Min(100, Math.Round(fill)));
        string key = colour + ":" + fill;
        if (key == lastIcon) return;
        using (var bitmap = new Bitmap(32, 32)) {
            using (var g = Graphics.FromImage(bitmap)) {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                var tint = ColorTranslator.FromHtml(colour);
                using (var track = new Pen(Color.FromArgb(85, tint), 4)) g.DrawEllipse(track, 4, 4, 24, 24);
                using (var pen = new Pen(tint, 4)) {
                    if (fill >= 100) g.DrawEllipse(pen, 4, 4, 24, 24);
                    else if (fill > 0) g.DrawArc(pen, 4, 4, 24, 24, -90, (float)(3.6 * fill));
                }
            }
            IntPtr handle = bitmap.GetHicon();
            try {
                using (var borrowed = Icon.FromHandle(handle)) {
                    var previous = tray.Icon;
                    tray.Icon = (Icon)borrowed.Clone();
                    if (previous != null) previous.Dispose();
                }
            } finally { DestroyIcon(handle); }
        }
        lastIcon = key;
    }
    private static void Render(string line) {
        var data = (IDictionary)json.DeserializeObject(line);
        var rows = (object[])data["rows"];
        if (rows.Length != 13) throw new ArgumentException("Invalid tray rows");
        for (int i = 0; i < rows.Length; i++) if (rows[i] != null) menu.Items[i].Text = Convert.ToString(rows[i]);
        for (int i = 8; i <= 12; i++) menu.Items[i].Available = Convert.ToBoolean(data["showFiveHour"]);
        refresh.Text = Text(data, "refresh");
        hide.Text = Text(data, "hide");
        string tooltip = Text(data, "tooltip");
        // .NET Framework NotifyIcon limits tooltip text to 63 characters.
        tray.Text = tooltip.Length > 63 ? tooltip.Substring(0, 63) : tooltip;
        UpdateIcon(Text(data, "colour"), Convert.ToDouble(data["fill"]));
    }
    private static void Cleanup() {
        if (tray != null) {
            tray.Visible = false;
            var icon = tray.Icon;
            tray.Dispose();
            if (icon != null) icon.Dispose();
        }
        if (menu != null) menu.Dispose();
    }
    public static void Run() {
        Create();
        var reader = new Thread(delegate() {
            try {
                string line;
                while ((line = Console.ReadLine()) != null) Interlocked.Exchange(ref latest, line);
            } finally { ended = true; }
        });
        reader.IsBackground = true;
        reader.Start();
        using (var timer = new System.Windows.Forms.Timer()) {
            timer.Interval = 200;
            timer.Tick += delegate {
                if (ended) { Application.Exit(); return; }
                string line = Interlocked.Exchange(ref latest, null);
                if (line != null) {
                    try { Render(line); } catch { Send("{\"action\":\"render-error\"}"); }
                }
            };
            timer.Start();
            Send("{\"action\":\"ready\"}");
            try { Application.Run(); } finally { Cleanup(); }
        }
    }
    // Native smoke test for Windows CI: icon handles, menus, Unicode, and actions.
    public static void SelfTest(string frame) {
        Create();
        try {
            Render(frame);
            if (tray.Icon == null || !tray.Visible || menu.Items.Count != 16) throw new Exception("Tray not initialized");
            if (!menu.Items[0].Text.StartsWith("使用建议")) throw new Exception("Unicode failed");
            var data = (IDictionary)json.DeserializeObject(frame);
            data["showFiveHour"] = false;
            Render(json.Serialize(data));
            for (int i = 8; i <= 12; i++) if (menu.Items[i].Available) throw new Exception("Missing short window should be hidden");
            data["showFiveHour"] = true;
            Render(json.Serialize(data));
            for (int i = 8; i <= 12; i++) if (!menu.Items[i].Available) throw new Exception("Short window should reappear");
            refresh.PerformClick();
            var languages = (ToolStripMenuItem)menu.Items[14];
            ((ToolStripMenuItem)languages.DropDownItems[1]).PerformClick();
            for (int i = 0; i < 200; i++) UpdateIcon(i % 2 == 0 ? "#66A8FF" : "#4CD9E6", i % 101);
            Console.WriteLine("WINDOWS_TRAY_SMOKE_OK");
        } finally { Cleanup(); }
    }
}
