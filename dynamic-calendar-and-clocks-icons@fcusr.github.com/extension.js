const {Gio, GLib, Pango, PangoCairo, Shell, St} = imports.gi;
const Cairo = imports.cairo;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Me = ExtensionUtils.getCurrentExtension();
const Search = imports.ui.search;
const Weather = imports.misc.weather;

const CALENDAR_FILE = 'org.gnome.Calendar.desktop';
const CLOCKS_FILE = 'org.gnome.clocks.desktop';
const WEATHER_FILE = 'org.gnome.Weather.desktop';

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

let weatherClient, weatherTimeout;

function createWeatherClient() {
    weatherClient = new Weather.WeatherClient();
    weatherTimeout = Mainloop.timeout_add_seconds(30, () => {
        weatherClient.info.update();
        return true;
    });
}

let settings, connects = [];
let enableCalendar, showWeekday, showMonth, enableClocks, showSeconds;
let enableWeather, showBackground, showTemperature;

function loadSettings() {
    settings = ExtensionUtils.getSettings
    ('org.gnome.shell.extensions.dynamic-calendar-and-clocks-icons');
    enableCalendar = settings.get_boolean('calendar');
    showWeekday = settings.get_boolean('show-weekday');
    showMonth = settings.get_boolean('show-month');
    enableClocks = settings.get_boolean('clocks');
    showSeconds = settings.get_boolean('show-seconds');
    enableWeather = settings.get_boolean('weather');
    showBackground = settings.get_boolean('show-background');
    showTemperature = settings.get_boolean('show-temperature');
    connects.push(settings.connect('changed::calendar', () => {
        enableCalendar = settings.get_boolean('calendar');
        redisplayIcons();
    }));
    connects.push(settings.connect('changed::show-weekday', () => {
        showWeekday = settings.get_boolean('show-weekday');
    }));
    connects.push(settings.connect('changed::show-month', () => {
        showMonth = settings.get_boolean('show-month');
    }));
    connects.push(settings.connect('changed::clocks', () => {
        enableClocks = settings.get_boolean('clocks');
        redisplayIcons();
    }));
    connects.push(settings.connect('changed::show-seconds', () => {
        showSeconds = settings.get_boolean('show-seconds');
    }));
    connects.push(settings.connect('changed::weather', () => {
        enableWeather = settings.get_boolean('weather');
        redisplayIcons();
    }));
    connects.push(settings.connect('changed::show-background', () => {
        showBackground = settings.get_boolean('show-background');
        redisplayIcons();
    }));
    connects.push(settings.connect('changed::show-temperature', () => {
        showTemperature = settings.get_boolean('show-temperature');
        weatherClient.emit('changed');
    }));
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

let iconTimeoutConnects = [];

function newIcon(iconSize, name, repaintFunc) {
    let icon = new St.DrawingArea();
    let timeout = Mainloop.timeout_add_seconds(1, () => {
        icon.queue_repaint();
        return true;
    });
    if(iconSize != -1) {
        let context = St.ThemeContext.get_for_stage(global.stage);
        iconSize *= context.scale_factor;
    }
    icon.requestedIconSize = iconSize;
    icon.set_size(iconSize, iconSize);
    icon.set_name('dynamic-' + name + '-icon');
    let connect = icon.connect('repaint', repaintFunc);
    icon.queue_repaint();
    iconTimeoutConnects.push([icon, timeout, connect]);
    return icon;
}

let weatherTimeoutConnects = [];

function newWeatherIcon(iconSize) {
    if(!showBackground) {
        return newWeatherIconWithoutBackground(iconSize);
    }
    let icon = new St.Bin({y_align: 2});
    let connect = weatherClient.connect('changed', () => {
        repaintWeather(icon);
    });
    icon.requestedIconSize = iconSize;
    if(iconSize != -1) {
        let context = St.ThemeContext.get_for_stage(global.stage);
        iconSize *= context.scale_factor;
    }
    icon.set_size(iconSize, iconSize);
    icon.set_name('dynamic-weather-icon');
    icon.boxLayout = new St.BoxLayout({vertical: true});
    icon.set_child(icon.boxLayout);
    icon.image = new St.Icon({x_align: 2});
    icon.boxLayout.add_child(icon.image);
    icon.label = new St.Label({x_align: 2});
    icon.boxLayout.add_child(icon.label);
    let timeout = Mainloop.timeout_add(0, () => {
        repaintWeather(icon);
        return false;
    });
    weatherTimeoutConnects.push([icon, timeout, connect]);
    return icon;
}

function newWeatherIconWithoutBackground(iconSize) {
    let icon = new St.Icon();
    let connect = weatherClient.connect('changed', () => {
        repaintWeatherWithoutBackground(icon);
    });
    icon.set_icon_size(iconSize);
    let timeout = Mainloop.timeout_add(0, () => {
        repaintWeatherWithoutBackground(icon);
        return false;
    });
    weatherTimeoutConnects.push([icon, timeout, connect]);
    return icon;
}

function repaintCalendar(icon) {
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicCalendar(icon);
        return;
    }
    let now = new Date();
    let day = now.toLocaleString('default', {weekday: 'short'});
    let month = now.toLocaleString('default', {month: 'short'});
    let date = now.getDate().toString();
    let context = icon.get_context();
    let iconSize = getIconSize(icon, context);
    let scaleFactor = iconSize / 512;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceSurface(calendar, 0, 0);
    context.paint();
    scaleFactor = 1 / scaleFactor;
    context.scale(scaleFactor, scaleFactor);
    context.setSourceRGB(0.965, 0.961, 0.957);
    let layout = PangoCairo.create_layout(context);
    let fontFace = 'Cantarell, sans-serif bold';
    let fontSize = iconSize / 96 * 14 + 'px';
    let desc = ' font_desc="' + fontFace + ' ' + fontSize + '"';
    let text;
    if(showWeekday) {
        text = showMonth ? day + ' ' + month : day;
    } else {
        text = showMonth ? month : '';
    }
    layout.set_markup('<span' + desc + '>' + text + '</span>', -1);
    let textX = (iconSize - layout.get_pixel_size()[0]) / 2;
    let baseline = layout.get_baseline() / Pango.SCALE;
    context.moveTo(textX, iconSize / 96 * 25 - baseline);
    PangoCairo.show_layout(context, layout);
    context.setSourceRGB(0.929, 0.2, 0.231);
    context.selectFontFace('Cantarell', 0, 1);
    context.setFontSize(iconSize / 96 * 28);
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
    context.setSourceRGB(0.949, 0.949, 0.949);
    context.selectFontFace('Cantarell', 0, 1);
    context.setFontSize(iconSize / 2);
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
    if(showSeconds) {
        context.translate(256, 252);
        context.rotate(seconds * 6 * Math.PI / 180 - minuteAngle);
        context.translate(-256, -252);
        context.setSourceSurface(second, 0, 0);
        context.paint();
    }
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

function repaintWeather(icon) {
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
    let iconSize = icon.requestedIconSize;
    let paddingTop = showTemperature ? 12 : 22;
    icon.boxLayout.style =
    'padding-top: ' + iconSize / 96 * paddingTop + 'px;' +
    'background-image: url(' + Me.path + '/img/weather.svg);' +
    'background-size: ' + iconSize + 'px;';
    let imagePath = Me.path + '/img/' + iconName + '.svg';
    let imageFile = Gio.File.new_for_path(imagePath);
    icon.image.set_gicon(Gio.FileIcon.new(imageFile));
    icon.image.set_icon_size(iconSize / 2);
    icon.label.set_text(temperature);
    icon.label.set_text_direction(1);
    icon.label.style =
    'color: #f6f5f4;' +
    'font-family: Cantarell, sans-serif;' +
    'font-weight: bold;' +
    'font-size: ' + iconSize / 96 * 15 + 'px;';
    icon.label.visible = showTemperature;
}

function repaintSymbolicWeather(icon) {
    let forecast = getForecast();
    let iconName = 'org.gnome.Weather-symbolic';
    if(forecast != null) {
        iconName = forecast.get_symbolic_icon_name();
    }
    icon.image.set_gicon(Gio.ThemedIcon.new(iconName));
    icon.image.set_icon_size(icon.requestedIconSize);
    icon.label.visible = false;
}

function repaintWeatherWithoutBackground(icon) {
    if(icon.get_theme_node().get_icon_style() == 2) {
        repaintSymbolicWeatherWithoutBackground(icon);
        return;
    }
    let forecast = getForecast();
    let iconName = 'weather-none';
    if(forecast != null) {
        iconName = forecast.get_icon_name();
    }
    let imagePath = Me.path + '/img/' + iconName + '.svg';
    let imageFile = Gio.File.new_for_path(imagePath);
    icon.set_gicon(Gio.FileIcon.new(imageFile));
}

function repaintSymbolicWeatherWithoutBackground(icon) {
    let forecast = getForecast();
    let iconName = 'org.gnome.Weather-symbolic';
    if(forecast != null) {
        iconName = forecast.get_symbolic_icon_name();
    }
    icon.set_gicon(Gio.ThemedIcon.new(iconName));
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

function getIconSize(icon, context) {
    let width = icon.get_width();
    let height = icon.get_height();
    let size = icon.requestedIconSize;
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
    let searchResults = controls._searchController._searchResults;
    searchResults._reloadRemoteProviders();
    Main.panel.statusArea['appMenu']._onIconThemeChanged();
}

function destroyObjects() {
    iconTimeoutConnects.forEach(iconTimeoutConnect => {
        Mainloop.source_remove(iconTimeoutConnect[1]);
        iconTimeoutConnect[0].disconnect(iconTimeoutConnect[2]);
        iconTimeoutConnect[0].destroy();
    });
    weatherTimeoutConnects.forEach(weatherTimeoutConnect => {
        Mainloop.source_remove(weatherTimeoutConnect[1]);
        weatherClient.disconnect(weatherTimeoutConnect[2]);
        weatherTimeoutConnect[0].destroy();
    });
    Mainloop.source_remove(weatherTimeout);
    connects.forEach(connect => {
        settings.disconnect(connect);
    });
    calendar = symbolicCalendar = clocks = symbolicClocks = null;
    hour = symbolicHour = minute = symbolicMinute = second = null;
    weatherClient = weatherTimeout = null;
    settings = null;
    connects = [];
    iconTimeoutConnects = [];
    weatherTimeoutConnects = [];
}

function enable() {
    createSurfaces();
    createWeatherClient();
    loadSettings();
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
