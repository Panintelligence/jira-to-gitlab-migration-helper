const config = require('./config.json');
const Jira = require('./jira.js');
const Gitlab = require('./gitlab.js');
const Dashboard = require('./dashboard.js');

let savedJsonRows = {}
try {
    savedJsonRows = require('./jsonRows.json');
} catch(e) {
    console.log("No saved rows...");
}
const fs = require('fs');

const jira = new Jira("https://your.jira.domain", "your auth token");
const gitlab = new Gitlab("https://your.gitlab.domain", "your private token", "username who you want to impersonate for most things");
const dashboard = new Dashboard("https://your.dashboard.domain");
const chartId = 12345;
const sprintChartId = 54321;

const asJsonDocument = async (row, columns, fetchComments) => {
    const jsonDoc = row.reduce((r, value, index) => {
        r[columns[index]] = value;
        return r;
    }, {});

    if(fetchComments){
        const issueCode = `${jsonDoc["Project Key"]}-${jsonDoc["Issue Number"]}`;
        try {
            const result = await jira.getComments(issueCode);
            jsonDoc.comments = result.comments;
            if (!result.comments) {
                console.warn(`No comments for ${issueCode}`);
                jsonDoc.comments = [];
            }
        } catch (e) {
            console.error(`Failed getting comments for ${issueCode}`);
            console.error(e);
        }
    }

    return jsonDoc;
}

const valueToLabel = (value, column) => {
    if (Object.keys(config.jiraToGitlab).includes(column)) {
        return config.jiraToGitlab[column][value] ? `${config.jiraToGitlab.fieldsTranslation[column]}::${config.jiraToGitlab[column][value]}` : `${config.jiraToGitlab.fieldsTranslation[column]}::${config.jiraToGitlab[column][""]}`;
    }
    if (column === "Status (Gitlab)" && ["Done", "Open"].includes(value)) {
        return null;
    }
    return `${config.jiraToGitlab.fieldsTranslation[column]}::${value}`;
}

const addNotes = async (rows) => {
    console.log("Adding notes...");
    for(let i=0; i<rows.length; i++){
        let row = rows[i];
        if (row.comments && row.comments.length > 0) {
            const issueCode = `${row["Project Key"]}-${row["Issue Number"]}`;
            try {
                await gitlab.addNotes(issueCode, row.comments);
                console.log(`Added notes to ${issueCode}`);
            } catch (e) {
                console.error(e);
            }
        }
    };
}

const addLabels = async (rows) => {
    await rows.forEach(async (row) => {
        const issueCode = `${row["Project Key"]}-${row["Issue Number"]}`;
        const labels = Object.keys(config.jiraToGitlab.fieldsTranslation)
            .map((key) => {
                return valueToLabel(row[key], key);
            })
            .filter(label => !!label);
        try {
            await gitlab.addLabels(issueCode, labels.join(","));
            console.log(`Added labels to ${issueCode}`);
        } catch (e) {
            console.error(e);
        }
    });
}

const resolveLinks = (jsonDoc) => {
    return jsonDoc.reduce((acc, row) => {
        const issueCode = `${row["Project Key"]}-${row["Issue Number"]}`;
        if(!Object.keys(acc).includes(issueCode)){
            acc[issueCode] = [];
        }
        acc[issueCode].push(`Zendesk:${row["Zendesk Ticket ID"]}`);
        return acc;
    }, {});
}

const addZendeskLabels = async (linksMap) => {
    await Object.keys(linksMap).forEach(async (issueCode) => {
        const labels = linksMap[issueCode];
        try {
            await gitlab.addLabels(issueCode, labels.join(","));
            console.log(`Adding Zendesk labels to ${issueCode}`);
        } catch (e) {
            console.error(e);
        }
    });
}

const addToMilestones = async (rows, sprints) => {
    try {
        const allMilestones = await gitlab.getMilestones();
        const milestoneMap = sprints.reduce((acc, value) => {
            const milestoneInfo = sprintToMilestoneInfo(value);
            acc[value] = allMilestones.find(m => m.title === milestoneInfo.name);
            return acc;
        }, {})

        await rows.forEach(async (row) => {
            const issueCode = `${row["Project Key"]}-${row["Issue Number"]}`;
            try {
                if(milestoneMap[row["Sprint (comma separated)"]]){
                    await gitlab.addMilestone(issueCode, milestoneMap[row["Sprint (comma separated)"]].id);
                }
            } catch (e) {
                console.error(e);
            }
        });
    } catch (e) {
        console.error("Unable to get milestones");
        console.error(e);
    }
}

const getDateName = (date, plusMonths) => {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "January"];
    const newDate = new Date(date)
    newDate.setMonth(newDate.getMonth() + plusMonths)
    return `${newDate.getFullYear()} ${monthNames[newDate.getMonth() + 1]}`
}

const sprintToMilestoneInfo = (jiraSprint) => {
    const splitted = jiraSprint.split(" ");
    const due = splitted[0].replace(/\//g, "-");
    const dueDate = new Date(due);
    const releaseName = splitted.includes("Release") ? `${getDateName(dueDate, 1)} Release` : `${getDateName(dueDate, 0)} Release`
    return {
        dueDate: due,
        name: releaseName
    }
}

const createMilestones = async (sprints) => {
    await sprints.forEach(async (sprint) => {
        const milestoneInfo = sprintToMilestoneInfo(sprint);
        try {
            await gitlab.createMilestone(milestoneInfo.name, milestoneInfo.dueDate);
        } catch (e) {
            console.error(e);
        }
    });
}

const assignUsers = async (rows) => {
    for(let i=0; i<rows.length; i++){
        const row=rows[i];
        const issueCode = `${row["Project Key"]}-${row["Issue Number"]}`;
        const assignee = config.jiraToGitlab.assignees[row["Assignee Name"]];
        if (assignee){
            console.log(`Assigning ${assignee} to ${issueCode}`)
            await gitlab.setAssignees(issueCode, [assignee]);
        }
    }
}

const processData = async (chartId, sprintChartId, actions, projectKey) => {
    const data = dashboard.getChartAsJson(chartId);
    const rows = data.data;
    const columns = data.displayNames;
    const filteredRows = projectKey === "all" ? rows : rows
        .filter(row => row[0] === projectKey);
    let jsonRows = savedJsonRows;
    if(Object.keys(savedJsonRows).length === 0){
        jsonRows = await Promise.all(filteredRows.map(async row => {
            try {
                return await asJsonDocument(row, columns, actions.includes("all") || actions.includes("comments"));
            } catch (e) {
                console.error(e);
                return null;
            }
        }));

        fs.writeFile('./jsonRows.json', JSON.stringify(jsonRows), 'utf8', () => {
            console.log("Saved rows.");
        });
    };

    const sprintData = dashboard.getChartAsJson(sprintChartId);
    const sprints = sprintData.data.map( row => row[0] );
    if(actions.includes("all") || actions.includes("makemilestones")){
        try{
            await createMilestones(sprints);
        } catch (e) {
            console.error(e);
        }
    }

    const linksMap = resolveLinks(jsonRows);
    if (!jsonRows.includes(null)) {
        try {
            if(actions.includes("all") || actions.includes("labels")){
                await addLabels(jsonRows);
            }
            if(actions.includes("all") || actions.includes("comments")){
                await addNotes(jsonRows);
            }
            if(actions.includes("all") || actions.includes("milestones")){
                await addToMilestones(jsonRows, sprints);
            }
            if(actions.includes("all") || actions.includes("zendesk")){
                await addZendeskLabels(linksMap);
            }
            if(actions.includes("all") || actions.includes("assignees")){
                await assignUsers(jsonRows);
            }
        } catch (e) {
            console.error(e);
        }
    }
}

const actions = process.argv[2].toLowerCase().split(",");
const projectArgs = process.argv.slice(3);
console.log(`Actions: ${actions.join(", ")}`);
console.log(`Projects: ${projectArgs.join(", ")}`);

try {
    projectArgs.forEach((proj) => {
        processData(chartId, sprintChartId, actions, proj);
    });
} catch (e) {
    console.error(e);
}

