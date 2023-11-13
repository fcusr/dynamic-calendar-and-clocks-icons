import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _}
from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
let Me;

function newRow(settings, group, title, key) {
    const actionRow = new Adw.ActionRow({
        title: title,
    });
    group.add(actionRow);
    const switcher = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
    });
    actionRow.add_suffix(switcher);
    actionRow.set_activatable_widget(switcher);
    settings.bind(key, switcher, 'active', Gio.SettingsBindFlags.DEFAULT);
}

function newThemeRow(settings, group) {
    let themesDir = Gio.File.new_for_path(Me.path + '/themes');
    let themes = [];
    try {
        let themeDirEnumerator = themesDir.enumerate_children
        ('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        let themeDir;
        while(themeDir = themeDirEnumerator.next_file(null)) {
            themes.push(themeDir.get_name());
        }
    } catch(e) {
        themes = [];
    }
    themes.sort((a, b) => a.localeCompare(b));
    let options = themes.slice();
    options.unshift(_('Follow System'));
    const themeRow = new Adw.ComboRow({
        title: _('Theme'),
        model: Gtk.StringList.new(options),
    });
    group.add(themeRow);
    let index = themes.indexOf(settings.get_string('theme'));
    themeRow.set_selected(index + 1);
    themeRow.connect('notify::selected', () => {
        let selected = themeRow.get_selected();
        let theme = selected == 0 ? '' : themes[selected - 1];
        settings.set_string('theme', theme);
    });
    settings.connect('changed::theme', () => {
        let index = themes.indexOf(settings.get_string('theme'));
        themeRow.set_selected(index + 1);
    });
}

export default class DynamicIconsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        Me = this;
        const settings = Me.getSettings
        ('org.gnome.shell.extensions.dynamic-calendar-and-clocks-icons');
        const page = new Adw.PreferencesPage();
        window.add(page);
        const themeGroup = new Adw.PreferencesGroup();
        page.add(themeGroup);
        newThemeRow(settings, themeGroup);
        const calendarGroup = new Adw.PreferencesGroup({
            title: _('Calendar'),
        });
        page.add(calendarGroup);
        newRow(settings, calendarGroup, _('Dynamic Calendar Icon'), 'calendar');
        newRow(settings, calendarGroup, _('Show Week Day'), 'show-weekday');
        newRow(settings, calendarGroup, _('Show Month'), 'show-month');
        const clocksGroup = new Adw.PreferencesGroup({
            title: _('Clocks'),
        });
        page.add(clocksGroup);
        newRow(settings, clocksGroup, _('Dynamic Clocks Icon'), 'clocks');
        newRow(settings, clocksGroup, _('Show Seconds'), 'show-seconds');
        const weatherGroup = new Adw.PreferencesGroup({
            title: _('Weather'),
        });
        page.add(weatherGroup);
        newRow(settings, weatherGroup, _('Dynamic Weather Icon'), 'weather');
        newRow(settings, weatherGroup, _('Show Background'), 'show-background');
        newRow(settings, weatherGroup, _('Show Temperature'), 'show-temperature');
        settings.connect('changed::show-background', () => {
            if(!settings.get_boolean('show-background')) {
                settings.set_boolean('show-temperature', false);
            }
        });
        settings.connect('changed::show-temperature', () => {
            if(settings.get_boolean('show-temperature')) {
                settings.set_boolean('show-background', true);
            }
        });
    }
}
