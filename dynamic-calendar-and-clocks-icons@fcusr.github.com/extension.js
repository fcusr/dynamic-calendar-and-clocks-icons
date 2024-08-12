import Cairo from 'gi://cairo';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import PangoCairo from 'gi://PangoCairo';
import Shell from 'gi://Shell';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Search from 'resource:///org/gnome/shell/ui/search.js';
import * as Weather from 'resource:///org/gnome/shell/misc/weather.js';
let Me;

const CALENDAR_FILE = 'org.gnome.Calendar.desktop';
const CLOCKS_FILE = 'org.gnome.clocks.desktop';
const WEATHER_FILE = 'org.gnome.Weather.desktop';

let weatherClient, weatherTimeout;

function createWeatherClient() {
    weatherClient = new Weather.WeatherClient();
    weatherTimeout = GLib.timeout_add_seconds(0, 30, () => {
        weatherClient.info.update();
        return true;
    });
}

let settings, textureHandler, handlers = [];
let enableCalendar, showWeekday, showMonth, enableClocks, showSeconds;
let enableWeather, showBackground, showTemperature;

function loadSettings() {
    settings = Me.getSettings
    ('org.gnome.shell.extensions.dynamic-calendar-and-clocks-icons');
    loadTheme();
    enableCalendar = settings.get_boolean('calendar');
    showWeekday = settings.get_boolean('show-weekday');
    showMonth = settings.get_boolean('show-month');
    enableClocks = settings.get_boolean('clocks');
    showSeconds = settings.get_boolean('show-seconds');
    enableWeather = settings.get_boolean('weather');
    showBackground = settings.get_boolean('show-background');
    showTemperature = settings.get_boolean('show-temperature');
    let textureCache = St.TextureCache.get_default();
    textureHandler = textureCache.connect('icon-theme-changed', () => {
        loadTheme();
        weatherClient.emit('changed');
    });
    handlers.push(settings.connect('changed::theme', () => {
        loadTheme();
        weatherClient.emit('changed');
    }));
    handlers.push(settings.connect('changed::calendar', () => {
        enableCalendar = settings.get_boolean('calendar');
        redisplayIcons();
    }));
    handlers.push(settings.connect('changed::show-weekday', () => {
        showWeekday = settings.get_boolean('show-weekday');
    }));
    handlers.push(settings.connect('changed::show-month', () => {
        showMonth = settings.get_boolean('show-month');
    }));
    handlers.push(settings.connect('changed::clocks', () => {
        enableClocks = settings.get_boolean('clocks');
        redisplayIcons();
    }));
    handlers.push(settings.connect('changed::show-seconds', () => {
        showSeconds = settings.get_boolean('show-seconds');
    }));
    handlers.push(settings.connect('changed::weather', () => {
        enableWeather = settings.get_boolean('weather');
        redisplayIcons();
    }));
    handlers.push(settings.connect('changed::show-background', () => {
        showBackground = settings.get_boolean('show-background');
        redisplayIcons();
    }));
    handlers.push(settings.connect('changed::show-temperature', () => {
        showTemperature = settings.get_boolean('show-temperature');
        weatherClient.emit('changed');
    }));
}

let path, themeData, stylesheetFile;

function loadTheme() {
    let theme = settings.get_string('theme');
    path = Me.path + '/themes/' + theme;
    if(!theme || !Gio.File.new_for_path(path).query_exists(null)) {
        let interfaceSettings = Me.getSettings
        ('org.gnome.desktop.interface');
        theme = interfaceSettings.get_string('icon-theme');
        path = Me.path + '/themes/' + theme;
        if(!theme || !Gio.File.new_for_path(path).query_exists(null)) {
            path = Me.path + '/themes/Adwaita';
        }
    }
    path += '/';
    let jsonFile = Gio.File.new_for_path(path + 'theme-data.json');
    let json = jsonFile.load_contents(null)[1];
    themeData = JSON.parse(new TextDecoder('utf-8').decode(json));
    let context = St.ThemeContext.get_for_stage(global.stage);
    if(stylesheetFile) {
        context.get_theme().unload_stylesheet(stylesheetFile);
    }
    stylesheetFile = Gio.File.new_for_path(path + 'stylesheet.css');
    context.get_theme().load_stylesheet(stylesheetFile);
    loadSurfaces();
}

let calendar, symbolicCalendar, clocks, symbolicClocks;
let hour, symbolicHour, minute, symbolicMinute, second;

function loadSurfaces() {
    calendar = loadSurface('calendar.png');
    symbolicCalendar = loadSurface('calendar-symbolic.png');
    clocks = loadSurface('clocks.png');
    symbolicClocks = loadSurface('clocks-symbolic.png');
    hour = loadSurface('hour.png');
    symbolicHour = loadSurface('hour-symbolic.png');
    minute = loadSurface('minute.png');
    symbolicMinute = loadSurface('minute-symbolic.png');
    second = loadSurface('second.png');
}

function loadSurface(file) {
    return Cairo.ImageSurface.createFromPNG(path + file);
}

let originalInit;

function initProviderInfo(provider) {
    originalInit.call(this, provider);
    let providerId = provider.appInfo.get_id();
    let icon = null;
    let iconSize = this.PROVIDER_ICON_SIZE;
    if(enableCalendar && providerId == CALENDAR_FILE) {
        icon = newIcon(iconSize, 'calendar', repaintCalendar); 
    } else if(enableClocks && providerId == CLOCKS_FILE) {
        icon = newIcon(iconSize, 'clocks', repaintClocks);
    } else if(enableWeather && providerId == WEATHER_FILE) {
        icon = newWeatherIcon(iconSize);
    }
    if(icon != null) {
        let oldIcon = this._content.get_child_at_index(0);
        this._content.replace_child(oldIcon, icon);
    }
}

let originalCreate;

function createIconTexture(iconSize) {
    if(enableCalendar && this.get_id() == CALENDAR_FILE) {
        return newIcon(iconSize, 'calendar', repaintCalendar);
    }
    if(enableClocks && this.get_id() == CLOCKS_FILE) {
        return newIcon(iconSize, 'clocks', repaintClocks);
    }
    if(enableWeather && this.get_id() == WEATHER_FILE) {
        return newWeatherIcon(iconSize);
    }
    return originalCreate.call(this, iconSize);
}

let calendarClocksIcons = [];

function newIcon(iconSize, name, repaintFunc) {
    let icon = new St.DrawingArea();
    icon.timeout = GLib.timeout_add_seconds(0, 1, () => {
        icon.queue_repaint();
        return true;
    });
    icon.requestedIconSize = iconSize;
    if(iconSize != -1) {
        let context = St.ThemeContext.get_for_stage(global.stage);
        iconSize *= context.scale_factor;
    }
    icon.scaledIconSize = iconSize;
    icon.set_size(iconSize, iconSize);
    icon.set_name('dynamic-' + name + '-icon');
    icon.handler = icon.connect('repaint', repaintFunc);
    icon.queue_repaint();
    addIconToArray(icon, disposeIcon, calendarClocksIcons);
    return icon;
}

let weatherIcons = [];

function newWeatherIcon(iconSize) {
    if(!showBackground) {
        return newWeatherIconWithoutBackground(iconSize);
    }
    let icon = new St.Bin({y_align: 2});
    icon.handler = weatherClient.connect('changed', () => {
        repaintWeather(icon);
    });
    icon.requestedIconSize = iconSize;
    if(iconSize != -1) {
        let context = St.ThemeContext.get_for_stage(global.stage);
        iconSize *= context.scale_factor;
    }
    icon.set_size(iconSize, iconSize);
    icon.set_name('dynamic-weather-icon');
    icon.boxLayout = new St.BoxLayout({vertical: true, y_expand: true});
    icon.set_child(icon.boxLayout);
    icon.image = new St.Icon({x_align: 2});
    icon.boxLayout.add_child(icon.image);
    icon.label = new St.Label({x_align: 2});
    icon.boxLayout.add_child(icon.label);
    icon.timeout = GLib.timeout_add(0, 0, () => {
        repaintWeather(icon);
        icon.timeout = null;
        return false;
    });
    addIconToArray(icon, disposeWeatherIcon, weatherIcons);
    return icon;
}

function newWeatherIconWithoutBackground(iconSize) {
    let icon = new St.Icon();
    icon.handler = weatherClient.connect('changed', () => {
        repaintWeatherWithoutBackground(icon);
    });
    icon.set_icon_size(iconSize);
    icon.timeout = GLib.timeout_add(0, 0, () => {
        repaintWeatherWithoutBackground(icon);
        icon.timeout = null;
        return false;
    });
    addIconToArray(icon, disposeWeatherIcon, weatherIcons);
    return icon;
}

function disposeIcon(icon) {
    GLib.source_remove(icon.timeout);
    icon.disconnect(icon.handler);
    icon.disconnect(icon.stageViewsChangedHandler);
    icon.disconnect(icon.destroyHandler);
}

function disposeWeatherIcon(icon) {
    if(icon.timeout != null) {
        GLib.source_remove(icon.timeout);
    }
    weatherClient.disconnect(icon.handler);
    icon.disconnect(icon.stageViewsChangedHandler);
    icon.disconnect(icon.destroyHandler);
}

function addIconToArray(icon, disposeFunc, array) {
    icon.stageViewsChangedHandler =
    icon.connect('stage-views-changed', () => {
        if(icon.get_stage() == null
        && !(icon.has_style_class_name('icon-dropshadow')
        && icon.requestedIconSize == 32)) {
            icon.destroy();
        }
    });
    icon.destroyHandler = icon.connect('destroy', () => {
        disposeFunc(icon);
        array.splice(array.indexOf(icon), 1);
    });
    array.push(icon);
}

function repaintCalendar(icon) {
    if(icon.get_stage() == null) return;
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicCalendar(icon);
        return;
    }
    let now = new Date();
    let locale = GLib.getenv('LC_TIME');
    if(locale != null) {
        locale = [locale.split('.')[0].replace('_', '-'), 'default'];
    } else {
        locale = 'default';
    }
    let day = now.toLocaleString(locale, {weekday: 'short'});
    let month = now.toLocaleString(locale, {month: 'short'});
    let date = now.getDate().toString();
    let dayMonthR = themeData.dayMonthColor[0] / 255;
    let dayMonthG = themeData.dayMonthColor[1] / 255;
    let dayMonthB = themeData.dayMonthColor[2] / 255;
    let dayMonthBold = themeData.dayMonthBold ? ' bold' : '';
    let {dayMonthFont, dayMonthSize, dayMonthPos} = themeData;
    let dateR = themeData.dateColor[0] / 255;
    let dateG = themeData.dateColor[1] / 255;
    let dateB = themeData.dateColor[2] / 255;
    let dateBold = themeData.dateBold ? 1 : 0;
    let {dateFont, dateSize, datePos, dateOnlyPos} = themeData;
    let context = icon.get_context();
    let iconSize = getIconSize(icon, context);
    let scaleFactor = iconSize / 512;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(calendar, 0, 0);
    context.paint();
    scaleFactor = 1 / scaleFactor;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceRGB(dayMonthR, dayMonthG, dayMonthB);
    let layout = PangoCairo.create_layout(context);
    let fontFace = dayMonthFont + ', sans-serif' + dayMonthBold;
    let fontSize = iconSize / 96 * dayMonthSize;
    let text;
    if(showWeekday) {
        text = showMonth ? day + ' ' + month : day;
    } else {
        text = showMonth ? month : '';
    }
    let maxWidth = iconSize / 96 * themeData.dayMonthMaxWidth;
    do {
        let desc = ' font_desc="' + fontFace + ' ' + fontSize + 'px"';
        layout.set_markup('<span' + desc + '>' + text + '</span>', -1);
        fontSize -= iconSize / 96;
    } while(layout.get_pixel_size()[0] > maxWidth && fontSize > 0);
    let textX = (iconSize - layout.get_pixel_size()[0]) / 2;
    let baseline = layout.get_baseline() / Pango.SCALE;
    context.moveTo(textX, iconSize / 96 * dayMonthPos - baseline);
    PangoCairo.show_layout(context, layout);
    context.setSourceRGB(dateR, dateG, dateB);
    context.selectFontFace(dateFont, 0, dateBold);
    context.setFontSize(iconSize / 96 * dateSize);
    let dateX = (iconSize - context.textExtents(date).width) / 2;
    datePos = showWeekday || showMonth ? datePos : dateOnlyPos;
    context.moveTo(dateX, iconSize / 96 * datePos);
    context.showText(date);
    context.$dispose();
}

function repaintSymbolicCalendar(icon) {
    let now = new Date();
    let date = now.getDate().toString();
    let symDateR = themeData.symDateColor[0] / 255;
    let symDateG = themeData.symDateColor[1] / 255;
    let symDateB = themeData.symDateColor[2] / 255;
    let symDateBold = themeData.symDateBold ? 1 : 0;
    let {symDateFont, symDateSize, symDatePos} = themeData;
    let context = icon.get_context();
    let iconSize = getIconSize(icon, context);
    let scaleFactor = iconSize / 128;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(symbolicCalendar, 0, 0);
    context.paint();
    scaleFactor = 1 / scaleFactor;
    context.scale(scaleFactor, scaleFactor);
    if(themeData.symDateDestOut) {
        context.setOperator(Cairo.Operator.DEST_OUT);
    }
    context.setSourceRGB(symDateR, symDateG, symDateB);
    context.selectFontFace(symDateFont, 0, symDateBold);
    context.setFontSize(iconSize / 16 * symDateSize);
    let dateX = (iconSize - context.textExtents(date).width) / 2;
    context.moveTo(dateX, iconSize / 16 * symDatePos);
    context.showText(date);
    context.$dispose();
}

function repaintClocks(icon) {
    if(icon.get_stage() == null) return;
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicClocks(icon);
        return;
    }
    let now = new Date();
    let hours = now.getHours() % 12;
    let minutes = now.getMinutes();
    let seconds = now.getSeconds();
    let clockCenter = themeData.clockCenter / 96 * 512;
    let context = icon.get_context();
    let scaleFactor = getIconSize(icon, context) / 512;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(clocks, 0, 0);
    context.paint();
    context.translate(256, clockCenter);
    let hourAngle = (hours + minutes / 60) * 30 * Math.PI / 180;
    context.rotate(hourAngle);
    context.translate(-256, -clockCenter);
    context.setSourceSurface(hour, 0, 0);
    context.paint();
    context.translate(256, clockCenter);
    let minuteAngle = (minutes + seconds / 60) * 6 * Math.PI / 180;
    context.rotate(minuteAngle - hourAngle);
    context.translate(-256, -clockCenter);
    context.setSourceSurface(minute, 0, 0);
    context.paint();
    if(showSeconds) {
        context.translate(256, clockCenter);
        context.rotate(seconds * 6 * Math.PI / 180 - minuteAngle);
        context.translate(-256, -clockCenter);
        context.setSourceSurface(second, 0, 0);
        context.paint();
    }
    context.$dispose();
}

function repaintSymbolicClocks(icon) {
    let now = new Date();
    let hours = now.getHours() % 12;
    let minutes = now.getMinutes();
    let symClockCenter = themeData.symClockCenter * 8;
    let context = icon.get_context();
    let scaleFactor = getIconSize(icon, context) / 128;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(symbolicClocks, 0, 0);
    context.paint();
    if(themeData.symClockDestOut) {
        context.setOperator(Cairo.Operator.DEST_OUT);
    }
    context.translate(64, symClockCenter);
    let hourAngle = (hours + minutes / 60) * 30 * Math.PI / 180;
    context.rotate(hourAngle);
    context.translate(-64, -symClockCenter);
    context.setSourceSurface(symbolicHour, 0, 0);
    context.paint();
    context.translate(64, symClockCenter);
    context.rotate(minutes * 6 * Math.PI / 180 - hourAngle);
    context.translate(-64, -symClockCenter);
    context.setSourceSurface(symbolicMinute, 0, 0);
    context.paint();
    context.$dispose();
}

function repaintWeather(icon) {
    if(icon.get_stage() == null) return;
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicWeather(icon);
        return;
    }
    let forecast = getForecast();
    let iconName = 'weather-none', temperature = ' --°';
    if(forecast != null) {
        iconName = forecast.get_icon_name();
        let [, tempValue] = forecast.get_value_temp(1);
        let prefix = Math.round(tempValue) >= 0 ? ' ' : '';
        temperature = prefix + Math.round(tempValue) + '°';
    }
    let {weatherSize, weatherPos, weatherOnlyPos} = themeData;
    let tempR = themeData.temperatureColor[0];
    let tempG = themeData.temperatureColor[1];
    let tempB = themeData.temperatureColor[2];
    let tempBold = themeData.temperatureBold ? 'bold' : 'normal';
    let {temperatureFont, temperatureSize} = themeData;
    let iconSize = icon.requestedIconSize;
    weatherPos = showTemperature ? weatherPos : weatherOnlyPos;
    icon.boxLayout.style =
    'padding-top: ' + iconSize / 96 * weatherPos + 'px;' +
    'background-image: url(' + path + 'weather.svg);' +
    'background-size: ' + iconSize + 'px;';
    icon.image.set_gicon(getWeatherImage(iconName));
    icon.image.set_icon_size(iconSize / 96 * weatherSize);
    icon.label.set_text(temperature);
    icon.label.set_text_direction(1);
    icon.label.style =
    'color: rgb(' + tempR + ',' + tempG + ',' + tempB + ');' +
    'font-family: ' + temperatureFont + ', sans-serif;' +
    'font-weight: ' + tempBold + ';' +
    'font-size: ' + iconSize / 96 * temperatureSize + 'px;' +
    'text-shadow: 0 0 transparent;';
    icon.label.visible = showTemperature;
}

function repaintSymbolicWeather(icon) {
    let forecast = getForecast();
    let iconName = 'weather-none-symbolic';
    if(forecast != null) {
        iconName = forecast.get_symbolic_icon_name();
    }
    icon.image.set_gicon(getWeatherImage(iconName));
    icon.image.set_icon_size(icon.requestedIconSize);
    icon.label.visible = false;
}

function repaintWeatherWithoutBackground(icon) {
    if(icon.get_stage() == null) return;
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicWeatherWithoutBackground(icon);
        return;
    }
    let forecast = getForecast();
    let iconName = 'weather-none';
    if(forecast != null) {
        iconName = forecast.get_icon_name();
    }
    icon.set_gicon(getWeatherImage(iconName));
}

function repaintSymbolicWeatherWithoutBackground(icon) {
    let forecast = getForecast();
    let iconName = 'weather-none-symbolic';
    if(forecast != null) {
        iconName = forecast.get_symbolic_icon_name();
    }
    icon.set_gicon(getWeatherImage(iconName));
}

function getForecast() {
    if(!weatherClient.available || !weatherClient.hasLocation
    || !weatherClient.info.is_valid()) {
        return null;
    }
    let forecasts = weatherClient.info.get_forecast_list();
    let now = GLib.DateTime.new_now_local();
    for(let i = 0; i < forecasts.length; i++) {
        let [valid, timestamp] = forecasts[i].get_value_update();
        if(!valid || timestamp == 0) {
            continue;
        }
        let datetime = GLib.DateTime.new_from_unix_local(timestamp);
        if(now.difference(datetime) < 1800 * 1000 * 1000) {
            return forecasts[i];
        }
    }
}

function getWeatherImage(iconName) {
    let imageFile = Gio.File.new_for_path(path + iconName + '.svg');
    return Gio.FileIcon.new(imageFile);
}

function getIconSize(icon, context) {
    let width = icon.get_width();
    let height = icon.get_height();
    let size = icon.scaledIconSize;
    if(size == -1) {
        size = Math.min(width, height);
    }
    context.translate((width - size) / 2, (height - size) / 2);
    return size;
}

function redisplayIcons() {
    let controls = Main.overview._overview._controls;
    let appDisplay = controls._appDisplay;
    let apps = appDisplay._orderedItems.slice();
    apps.forEach(icon => {
        if(icon._id == CALENDAR_FILE || icon._id == CLOCKS_FILE
        || icon._id == WEATHER_FILE) {
            icon.icon.update();
        }
    });
    let folderIcons = appDisplay._folderIcons;
    folderIcons.forEach(folderIcon => {
        let appsInFolder = folderIcon.view._orderedItems.slice();
        appsInFolder.forEach(icon => {
            if(icon._id == CALENDAR_FILE || icon._id == CLOCKS_FILE
            || icon._id == WEATHER_FILE) {
                icon.icon.update();
            }
        });
        folderIcon.icon.update();
    });
    let dash = controls.dash;
    let children = dash._box.get_children().filter(actor => {
        return actor.child
        && actor.child._delegate && actor.child._delegate.app;
    });
    children.forEach(actor => {
        let actorId = actor.child._delegate.app.get_id();
        if(actorId == CALENDAR_FILE || actorId == CLOCKS_FILE
        || actorId == WEATHER_FILE) {
            actor.child.icon.update();
        }
    });
    let textureCache = St.TextureCache.get_default();
    textureCache.disconnect(textureHandler);
    textureCache.emit('icon-theme-changed');
    textureHandler = textureCache.connect('icon-theme-changed', () => {
        loadTheme();
        weatherClient.emit('changed');
    });
}

function destroyObjects() {
    let context = St.ThemeContext.get_for_stage(global.stage);
    context.get_theme().unload_stylesheet(stylesheetFile);
    calendarClocksIcons.forEach(calendarClocksIcon => {
        disposeIcon(calendarClocksIcon);
        calendarClocksIcon.destroy();
    });
    calendarClocksIcons = [];
    weatherIcons.forEach(weatherIcon => {
        disposeWeatherIcon(weatherIcon);
        weatherIcon.destroy();
    });
    weatherIcons = [];
    GLib.source_remove(weatherTimeout);
    St.TextureCache.get_default().disconnect(textureHandler);
    handlers.forEach(handler => {
        settings.disconnect(handler);
    });
    handlers = [];
    weatherClient = weatherTimeout = null;
    settings = textureHandler = themeData = stylesheetFile = null;
    calendar = symbolicCalendar = clocks = symbolicClocks = null;
    hour = symbolicHour = minute = symbolicMinute = second = null;
}

export default class DynamicIconsExtension extends Extension {
    enable() {
        Me = this;
        createWeatherClient();
        loadSettings();
        //originalInit = Search.ProviderInfo.prototype._init;
        originalCreate = Shell.App.prototype.create_icon_texture;
        //Search.ProviderInfo.prototype._init = initProviderInfo;
        Shell.App.prototype.create_icon_texture = createIconTexture;
        redisplayIcons();
    }

    disable() {
        //Search.ProviderInfo.prototype._init = originalInit;
        Shell.App.prototype.create_icon_texture = originalCreate;
        redisplayIcons();
        destroyObjects();
        Me = null;
    }
}
