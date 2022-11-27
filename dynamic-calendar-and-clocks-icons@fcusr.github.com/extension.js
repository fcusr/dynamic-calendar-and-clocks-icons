const Cairo = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Me = ExtensionUtils.getCurrentExtension();
const Search = imports.ui.search;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const CALENDAR_FILE = 'org.gnome.Calendar.desktop';
const CLOCKS_FILE = 'org.gnome.clocks.desktop';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let calendar, symbolicCalendar, clocks, symbolicClocks;
let hour, symbolicHour, minute, symbolicMinute, second;

function createSurfaces() {
    calendar = createSurface('calendar.png');
    symbolicCalendar = createSurface('calendar-symbolic.png');
    clocks = createSurface('clocks.png');
    symbolicClocks = createSurface('clocks-symbolic.png');
    hour = createSurface('hour.png');
    symbolicHour = createSurface('hour-symbolic.png');
    minute = createSurface('minute.png');
    symbolicMinute = createSurface('minute-symbolic.png');
    second = createSurface('second.png');
}

function createSurface(file) {
    let path = Me.path + '/img/';
    return Cairo.ImageSurface.createFromPNG(path + file);
}

let originalInit;

function initProviderInfo(provider) {
    originalInit.call(this, provider);
    let icon = null;
    let iconSize = this.PROVIDER_ICON_SIZE;
    if(provider.appInfo.get_id() == CALENDAR_FILE) {
        icon = newIcon(iconSize, 'calendar', repaintCalendar); 
    } else if(provider.appInfo.get_id() == CLOCKS_FILE) {
        icon = newIcon(iconSize, 'clocks', repaintClocks);
    }
    if(icon != null) {
        let oldIcon = this._content.get_child_at_index(0);
        this._content.replace_child(oldIcon, icon);
    }
}

let originalCreate;

function createIconTexture(iconSize) {
    if(this.get_id() == CALENDAR_FILE) {
        return newIcon(iconSize, 'calendar', repaintCalendar);
    }
    if(this.get_id() == CLOCKS_FILE) {
        return newIcon(iconSize, 'clocks', repaintClocks);
    }
    return originalCreate.call(this, iconSize);
}

let iconTimeoutConnects = [];

function newIcon(iconSize, name, repaintFunc) {
    let icon = new St.DrawingArea();
    let timeout = Mainloop.timeout_add_seconds(1, () => {
        icon.queue_repaint();
        return true;
    });
    icon.set_size(iconSize, iconSize);
    icon.set_name('dynamic-' + name + '-icon');
    let connect = icon.connect('repaint', repaintFunc);
    icon.queue_repaint();
    iconTimeoutConnects.push([icon, timeout, connect]);
    return icon;
}

function repaintCalendar(icon) {
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicCalendar(icon);
        return;
    }
    let now = new Date();
    let day = DAYS[now.getDay()];
    let month = MONTHS[now.getMonth()];
    let date = now.getDate().toString();
    let context = icon.get_context();
    let iconSize = getIconSize(icon, context);
    let scaleFactor = iconSize / 512;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(calendar, 0, 0);
    context.paint();
    scaleFactor = 1 / scaleFactor;
    context.scale(scaleFactor, scaleFactor);
    context.selectFontFace('Cantarell', 0, 1);
    context.setFontSize(iconSize / 96 * 14);
    context.setSourceRGB(0.965, 0.961, 0.957);
    let text = day + ' ' + month;
    let textX = (iconSize - context.textExtents(text).width) / 2;
    context.moveTo(textX, iconSize / 96 * 25);
    context.showText(text);
    context.setFontSize(iconSize / 96 * 28);
    context.setSourceRGB(0.929, 0.2, 0.231);
    let dateX = (iconSize - context.textExtents(date).width) / 2;
    context.moveTo(dateX, iconSize / 96 * 68);
    context.showText(date);
    context.$dispose();
}

function repaintSymbolicCalendar(icon) {
    let now = new Date();
    let date = now.getDate().toString();
    let context = icon.get_context();
    let iconSize = getIconSize(icon, context);
    let scaleFactor = iconSize / 128;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(symbolicCalendar, 0, 0);
    context.paint();
    scaleFactor = 1 / scaleFactor;
    context.scale(scaleFactor, scaleFactor);
    context.selectFontFace('Cantarell', 0, 1);
    context.setFontSize(iconSize / 2);
    context.setSourceRGB(0.949, 0.949, 0.949);
    let dateX = (iconSize - context.textExtents(date).width) / 2;
    context.moveTo(dateX, iconSize / 16 * 12);
    context.showText(date);
    context.$dispose();
}

function repaintClocks(icon) {
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicClocks(icon);
        return;
    }
    let now = new Date();
    let hours = now.getHours() % 12;
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    let context = icon.get_context();
    let scaleFactor = getIconSize(icon, context) / 512;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(clocks, 0, 0);
    context.paint();
    context.translate(256, 252);
    let hourAngle = (hours + minutes / 60) * 30 * Math.PI / 180;
    context.rotate(hourAngle);
    context.translate(-256, -252);
    context.setSourceSurface(hour, 0, 0);
    context.paint();
    context.translate(256, 252);
    let minuteAngle = (minutes + seconds / 60) * 6 * Math.PI / 180;
    context.rotate(minuteAngle - hourAngle);
    context.translate(-256, -252);
    context.setSourceSurface(minute, 0, 0);
    context.paint();
    context.translate(256, 252);
    context.rotate(seconds * 6 * Math.PI / 180 - minuteAngle);
    context.translate(-256, -252);
    context.setSourceSurface(second, 0, 0);
    context.paint();
    context.$dispose();
}

function repaintSymbolicClocks(icon) {
    let now = new Date();
    let hours = now.getHours() % 12;
    let minutes = now.getMinutes();
    let context = icon.get_context();
    let scaleFactor = getIconSize(icon, context) / 128;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(symbolicClocks, 0, 0);
    context.paint();
    context.setOperator(Cairo.Operator.DEST_OUT);
    context.translate(64, 64);
    let hourAngle = (hours + minutes / 60) * 30 * Math.PI / 180;
    context.rotate(hourAngle);
    context.translate(-64, -64);
    context.setSourceSurface(symbolicHour, 0, 0);
    context.paint();
    context.translate(64, 64);
    context.rotate(minutes * 6 * Math.PI / 180 - hourAngle);
    context.translate(-64, -64);
    context.setSourceSurface(symbolicMinute, 0, 0);
    context.paint();
    context.$dispose();
}

function getIconSize(icon, context) {
    let width = icon.get_width();
    let height = icon.get_height();
    let min = Math.min(width, height);
    context.translate((width - min) / 2, (height - min) / 2);
    return min;
}

function redisplayIcons() {
    let controls = Main.overview._overview._controls;
    let appDisplay = controls._appDisplay;
    let apps = appDisplay._orderedItems.slice();
    apps.forEach(icon => {
        if(icon._id == CALENDAR_FILE || icon._id == CLOCKS_FILE) {
            appDisplay._removeItem(icon);
        }
    });
    appDisplay._redisplay();
    let dash = controls.dash;
    let children = dash._box.get_children().filter(actor => {
        return actor.child
        && actor.child._delegate && actor.child._delegate.app;
    });
    children.forEach(actor => {
        let actorId = actor.child._delegate.app.get_id();
        if(actorId == CALENDAR_FILE || actorId == CLOCKS_FILE) {
            actor.destroy();
        }
    });
    dash._redisplay();
    let searchResults = controls._searchController._searchResults;
    searchResults._reloadRemoteProviders();
}

function destroyObjects() {
    iconTimeoutConnects.forEach(iconTimeoutConnect => {
        Mainloop.source_remove(iconTimeoutConnect[1]);
        iconTimeoutConnect[0].disconnect(iconTimeoutConnect[2]);
        iconTimeoutConnect[0].destroy();
    });
    calendar = symbolicCalendar = clocks = symbolicClocks = null;
    hour = symbolicHour = minute = symbolicMinute = second = null;
    iconTimeoutConnects = [];
}

function enable() {
    createSurfaces();
    originalInit = Search.ProviderInfo.prototype._init;
    originalCreate = Shell.App.prototype.create_icon_texture;
    Search.ProviderInfo.prototype._init = initProviderInfo;
    Shell.App.prototype.create_icon_texture = createIconTexture;
    redisplayIcons();
}

function disable() {
    Search.ProviderInfo.prototype._init = originalInit;
    Shell.App.prototype.create_icon_texture = originalCreate;
    redisplayIcons();
    destroyObjects();
}
